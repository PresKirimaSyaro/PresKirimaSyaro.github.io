---
title: "[计组实验] P6考试 MIPS 流水线 CPU 设计"
slug: "cop6"
date: 2026-11-23T21:14:15+08:00
draft: false
tags: ["笔记"]
categories: ["计算机组成"]
author: "PresKirimaSyaro"
showToc: true
TocOpen: false
description: ""
summary: ""
comments: true
weight: 109
---

## P6 的评价

> 出的什么司凤题目。

**私以为计组上机是为了充分理解 cpu 系统是如何运行的，流水线是如何构建的，**
**冒险是如何通过延迟槽、阻塞和转发解决的，而不是用 verilog 考程序设计。**

**所以真正的好题目应该考添加流水线通路，调整阻塞、转发通路相关操作，**
**出这种字节计算只能理解为在为难人。**

这次上机似乎评测逻辑变了，提交之间的冷却时间被取消了，这就导致排队时间非常长。
大约一个半小时过了后两个题，第一题写完排了一百多个人，最后 20:55 才出来结果，痛失 AK，，，

考试之前还是建议练练往年题，找找手感。虽然说这一套题和往年题相似度很低，但是提高熟练度总还是有好处的。

这里给舍友的模拟评测机打一个广告：[https://github.com/cqy20070511/BUAA-CO_P3-P6-local_judge](https://github.com/cqy20070511/BUAA-CO_P3-P6-local_judge)。

收录了好几年的 `p3, p4, p5, p6` 往年题和 ai 模拟题。clone 下来直接让 ai 搭起来就好，在浏览器中就可以打开评测了

## P6 题目

### T1 MRB

格式 `mrb rd, rs, rt`

`000000 rs rt rd 00000 mrb(111110)`

`R[rs]` 和 `LO` 无符号相加，将和循环左移 `LO[4:0]` 位得到临时结果，将临时结果写入 `R[rd]`，
再将临时结果和 `R[rt]` 无符号相乘得到 64 位乘积，将乘积的每一个字节高低逆序排列，
字节位置不变，分别将高低 32 位写入 `HI, LO`。乘法和 reverse 共消耗 6 周期。

RTL:
```
sum <- (R[rs] + LO) mod 2^32
sa <- LO[4:0]
left <- (sum << sa) mod 2^32
right <- (sum >> (32 - sa)) mod 2^32
rot <- left | right
prod <- rot * R[rt]
{Hi, LO} <- byte_reverse(prod)
```

此题未过，这里简单说一下我的做法吧。

因为要写入 `rd`，所以 `rot` 的计算放在 alu，走一般的通路。对于相关标记：
$$
t(rs) = t(rt) = 1, lag = 2
$$

乘除法单元单独再把整个流程计算一遍，写入 `HI, LO`

最后评测的结果似乎是计算结果不对，可能是计算的函数写错了

### T2 BEL

格式 `bel rs, rt, label`

`bel(011010) rs rt offset`

逐字节比较 `R[rs]` 和 `R[rt]`，若恰好只有一个字节相等，那么令 `index` 为这个字节的编号（从低到高 0 到 3），
否则令 `index = -1`。
若 `index` != -1，跳转到 `label`，并将 `PC + 8` 写入 `R[rs][idx * 8 + 4 : idx * 8]` 号寄存器；否则不跳转，清空延迟槽。

RTL:
```
index <- match_byte(R[rs], R[rt])
if (index != -1) then
    dst <- R[rs][8*index + 7 : 8*index]
    R[dst] <- pc + 8
    pc <- pc + 4 + sign_ext(offset || 00)
else
    clear_delay_slot()
```

主要考点在于清空延迟槽和不定寄存器写入，还有唐氏字节计算

先列出数据读写标记：
$$
t(rs) = t(rt) = 0, lag = 1, target = 0xffffffff
$$

我这里将跳转、清槽逻辑全部放到了 DCtrl 里面，写起来会方便一些：
```verilog
`include "constants.vh"
`include "decode.vh"

module DCtrl (
    input [31:0]    IR,
    input [31:0]    RD1,
    input [31:0]    RD2,
    input [31:0]    D_pc4,

    output          EXT_sign,
    output [31:0]   D_npc,
    output [1:0]    MPC,
    output          slot_clr,
    output          zero
);

`DECODE_INSTRUCTIONS(IR)

wire [25:0] imm26;
wire [15:0] imm16;
assign imm16 = IR[0+:16];
assign imm26 = IR[0+:26];

function [2:0] bel_index(input [31:0] x, input [31:0] y);
integer i;
reg [3:0] cmp;
begin
    for (i = 0; i < 4; i = i + 1) begin
        if (x[{i[1:0], 3'b000}+: 8] == y[{i[1:0], 3'b000}+: 8]) cmp[i] = 1'b1;
        else cmp[i] = 1'b0;
    end
    bel_index = (
        cmp == 4'b0001 ? 3'b0 :
        cmp == 4'b0010 ? 3'b1 :
        cmp == 4'b0100 ? 3'b2 :
        cmp == 4'b1000 ? 3'b3 :
        3'b4
    );
end
endfunction

assign EXT_sign = |{cla_load, cla_save, ins_addi};
assign MPC = (
    // MPC = 1 表示下一步 PC 要跳转，选择 D_npc
    |{ins_jr, ins_jalr, ins_jal, ins_j, ins_beq & zero, ins_bne & zero, ins_bel & zero} ? 1:
    0
);
assign D_npc = (
    |{ins_j, ins_jal} ? {
        D_pc4[31-:4],
        imm26,
        2'b00
    } :
    |{ins_jr, ins_jalr} ? RD1 :
    D_pc4 + {{14{imm16[15]}}, imm16, 2'b00} // 选取默认的 branch 方式
);
assign slot_clr = ins_bel & ~zero; // 该指令清空延迟槽的条件
assign zero = (
    ins_beq ? RD1 == RD2 :
    ins_bne ? RD1 != RD2 :
    ins_bel ? bel_index(RD1, RD2) != 3'd4 :
    1'b0
);
endmodule
```

这里的 `slot_clr` 表示该指令清空延迟槽的条件，而在主模块中这里还需判断是否阻塞。
`bel` 被阻塞在 D 级的时候 DCtrl 仍然会做出判断，这时清空延迟槽会把自己清掉。

所以在主模块中需要这样写：
```verilog
assign FD_clr = ~stall & slot_clr;
```

强烈建议在课下写流水线的时候就加上清空延迟槽的功能。

条件写 31 寄存器放在了 DEreg 里，专门写一个函数重算一遍 `index` 然后更新 data promise 就好了
```verilog
E_promise <= (
    |{ins_jal, ins_jalr} ? 
        {5'd0, target32, D_pc8} :
    ins_bel ?
        bel_promise(RD1, RD2, D_pc8) :
        {|lag5 ? lag5-5'd1: lag5, target32, val32}
);
```

### T3 LNB

取出内存地址为 `R[rs] + sign_ext(offset)` 位置的字 `data`，令 `ref` 为 `R[rt]` 的低 8 位，
逐一比较 `data` 的四个字节和 `ref`，令 `index` 为与 `ref` 差的绝对值最小的 `data` 字节编号（如果相同选最小），
将 `zero_ext(data[8*index + 7: 8*index])` 写入 `R[rt + index]`

RTL:
```
addr <- R[rs] + sign_ext(offset)
data <- mem[addr[31:2]]
ref <- R[rt][7:0]
index <- nearest_byte_index(data, ref)
dst <- rt + index
R[dst] <- zero_ext(data[8*index + 7, 8*index])
```

考点依旧是不定寄存器写入和四凤字节计算

最终写入的寄存器编号只可能在 $\{rt, rt + 1, rt + 2, rt + 3\}$ 中，其他部分和 save 系指令类似，所以标记：
$$
    t(rs) = 1, t(rt) = 2, lag = 3, target = 0xf << rt
$$

这里给出 MCtrl 的写法，用函数做了一些抽象，看起来简洁一些
（verilog 的循环中不能用 break 和 continue，所以要尽可能用标记或者调整扫描顺序的方法做）：
```verilog
`include "constants.vh"
`include "decode.vh"

module MCtrl (
    input [31:0]    IR,
    input [31:0]    M_RD2,
    input [31:0]    M_AO,
    input [31:0]    m_data_rdata,

    output [31:0]   DM_DR,
    output [31:0]   m_data_addr,
    output [31:0]   m_data_wdata,
    output [3:0]    m_data_byteen,
    output [1:0]    lnb_index // 传出 index，为了给 MWreg 流水寄存器更新写寄存器编号
);

`DECODE_INSTRUCTIONS(IR)

function [31:0] ext8(input [7:0] in, input sign);
begin
    ext8 = {
        {24{in[7] & sign}},
        in
    };
end
endfunction
function [31:0] ext16(input [15:0] in, input sign);
begin
    ext16 = {
        {16{in[15] & sign}},
        in
    };
end
endfunction

wire [1:0] ba;  // byte address
assign ba = M_AO[1:0];
wire [4:0] half_st, byte_st;
assign half_st = {ba[1], 4'b0};
assign byte_st = {ba, 3'b0};

function [32:0] signabs(input [7:0] x, input [7:0] y);
reg[31:0] extx, exty;
begin
    extx = ext8(x, 0);
    exty = ext8(y, 0);
    if ($signed(x) >= $signed(y)) signabs = $signed(x) - $signed(y);
    else signabs = $signed(y) - $signed(x);
end
endfunction

function [1:0] nearest_byte_index(input [7:0] ref, input [31:0] data);
integer i;
reg [31:0] minabs;
reg [7:0] bytedata;
reg [1:0] res;
begin
    for (i = 3; i >= 0; i = i - 1) begin
        bytedata = data[{i[1:0], 3'b000}+: 8];
        if (i == 3) begin
            minabs = signabs(bytedata, ref);
            res = i[1:0];
        end
        else begin
            if (minabs >= signabs(bytedata, ref)) begin
                minabs = signabs(bytedata, ref);
                res = i[1:0];
            end
        end
    end
    nearest_byte_index = res;
end
endfunction

assign lnb_index = nearest_byte_index(M_RD2[7:0], m_data_rdata); // 计算 index

assign DM_DR = (
    ins_lw  ? m_data_rdata :
    ins_lh  ? ext16(m_data_rdata[half_st+: 16], 1) :
    ins_lb  ? ext8(m_data_rdata[byte_st+: 8], 1) :
    ins_lhu ? ext16(m_data_rdata[half_st+: 16], 0) :
    ins_lbu ? ext8(m_data_rdata[byte_st+: 8], 0) :
    ins_lnb ? ext8(m_data_rdata[{lnb_index, 3'b000}+: 8], 0) : // 填入相应字节零拓展
    32'b0
);
assign m_data_addr  = M_AO;
assign m_data_wdata = (
    ins_sw  ? 
        M_RD2 :
    ins_sh  ?
        {2{M_RD2[0+: 16]}} :
    ins_sb  ?
        {4{M_RD2[0+: 8]}} :
    // default:
        M_RD2
);
assign m_data_byteen = (
    ins_sw  ?
        4'b1111 :
    ins_sh  ?
        4'b0011 << {ba[1], 1'b0}:
    ins_sb  ?
        4'b0001 << ba   :
    // default:
        4'b0000
);


endmodule
```