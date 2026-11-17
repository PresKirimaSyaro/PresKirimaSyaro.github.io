---
title: "[计组实验] P5考试 MIPS 流水线 CPU 设计"
slug: "cop5"
date: 2026-11-16T23:20:14+08:00
draft: false
tags: ["笔记"]
categories: ["计算机组成"]
author: "PresKirimaSyaro"
showToc: true
TocOpen: false
description: ""
summary: ""
comments: true
weight: 107
---

## 一些经验

### 如果你习惯使用 iverilog

已知北区机房的 windows 一级虚拟机环境下均没有 iverilog。
唯一的方法是下载 iverilog windows 安装包，塞入设计文档里提交。
**记得至少下两个版本**，要兼容 Win10 和 Win7。

安装包可以离线安装，安装时记得勾选添加到系统路径以及勾上 gtkwave。
这样就可以在命令行中使用 iverilog + vvp + gtkwave 组合技了。

iverilog 下载连接：[bleyer.org/icarus](https://bleyer.org/icarus/)

### gtkwave 卡顿的解决方法

gtkwave 在 win11 上可能出现卡顿的问题，实测在机房北区 win10 上安装没有这个问题，非常流畅。
在 win11 系统上时，可以在 gtkwave 中再打开一份当前的文件，就会变得流畅。

### 考前需要注意

+ 记得检查是否添加了 $display 信号，**没有添加课下弱测和中测也会过！！！**
+ 检查你的 cpu 是否支持下面的功能，题目很可能考到：
  + 清空延迟槽
  + 写入的寄存器编号根据条件判断有多种可能
+ 尽量熟悉你的代码实现，要熟悉添加一条指令的流程。例如对于我使用的实现来说，添加一条指令的流程是：
  1. 在纸上画出数据流图，包括各级流水线，标注需要接收转发位置和结果产生位置
  2. 在表中加入 $t_I(rs(I)), t_I(rt(I))$, 初始 $lag$, $target$ 等数据
  3. 添加宏，以及译码部分
  4. 添加发射 promise 逻辑
  5. 添加阻塞逻辑
  6. 按流水线逐级添加数据流+控制流，在结果产生级流水寄存器将数据写入 promise
  7. 添加跳转逻辑
+ 练习数道往年题，熟悉基本的题型

P5 不难，只要你熟悉基本指令添加流程，对流水线机制理解到位，实现也足够有兼容性，就可以轻松过 P~

## P5 上机考试题目

### T1 revclz

格式：`revclz rs rt imm16`

如果 imm16[0] = 1，那么将 `R[rs]` 高低翻转写入 `R[rt]`
如果 imm16[0] = 0，那么将 `R[rt]` 的高位前导零个数写入 `R[rt]`

RTL:
记 rev(x) 表示将 32 位 x 高低翻转得到的结果
clz(x) 为 x 前导零的个数（约定 clz(0) = 32）
```
if imm16[0] = 1 then
    R[rt] <- rev(R[rs])
else
    R[rt] <- clz(R[rt])
```

往年的计算类指令一般不会要修改流水线、阻塞转发的部分。
只需要按照一般 R 型计算指令或者 I 型计算指令添加 ALU 中的计算即可。

但是这道题的指令和普通 I 型指令不太一样，imm16[0] 的取值会影响它对于 `R[rs]` 和 `R[rt]` 的依赖关系。

例如：
```assembly
lw      $8, 4($0)
revclz  $9, $8, 2
```

如果第二条指令是 `ori $9, $8, 2` 那么肯定得阻塞，但是由于 imm16[0] = 0，所以这条指令并不需要 `R[rs]` 的值。所以并不需要阻塞（不知道有没有卡这种 TLE）。

我的设计方式并没有考虑过这种情况，对于这种指令的最好处理方式就是**当成两条指令做**
（我的舍友之前聊到过这个方法，致敬:>）

在解码部分，直接特判 imm16[0]，当成两条指令，分为两个指令信号：

```verilog
`define DECODE_INSTRUCTIONS(IR)                                    \
    wire [5:0] opcode, funct;                                      \
    assign opcode = IR[31-:6];                                     \
    assign funct  = IR[0+:6];                                      \
                                                                    \
    wire ins_add, ins_sub, ins_ori, ins_lw, ins_sw;                 \
    wire ins_beq, ins_lui, ins_jal, ins_jr, ins_sll;                \
    wire ins_rev, ins_clz;  \
                                                                    \
    assign ins_add = (~|opcode) && (funct == `funct_add);           \
    assign ins_sub = (~|opcode) && (funct == `funct_sub);           \
    assign ins_ori = opcode == `opcode_ori;                         \
    assign ins_lw  = opcode == `opcode_lw;                          \
    assign ins_sw  = opcode == `opcode_sw;                          \
    assign ins_beq = opcode == `opcode_beq;                         \
    assign ins_lui = opcode == `opcode_lui;                         \
    assign ins_jal = opcode == `opcode_jal;                         \
    assign ins_jr  = (~|opcode) && (funct == `funct_jr);            \
    assign ins_rev  = opcode == `opcode_revclz & imm16[0] == 1'b1;  \
    assign ins_clz  = opcode == `opcode_revclz & imm16[0] == 1'b0;   
```

派发控制信号（尤其是阻塞信号）的时候，就可以独立处理：
```verilog
assign ALU_Mod = (
    |{ins_add, ins_lw, ins_sw, ins_addi} ? `alu_add :
    ins_sub ? `alu_sub :
    |{ins_ori, ins_or}      ? `alu_or :
    |{ins_sll, ins_sllv}    ? `alu_sll :
    ins_lui ? `alu_lui :
    ins_rev ? `alu_rev :
    ins_clz ? `alu_clz :
        `alu_add
);

assign stall = (
    ins_add     ? check(rs, 1, promises) | check(rt, 1, promises) :
    ins_sub     ? check(rs, 1, promises) | check(rt, 1, promises) :
    ins_ori     ? check(rs, 1, promises) :
    ins_lw      ? check(rs, 1, promises) :
    ins_sw      ? check(rs, 1, promises) | check(rt, 2, promises) :
    ins_beq     ? check(rs, 0, promises) | check(rt, 0, promises) :
    ins_jr      ? check(rs, 0, promises) :
    ins_sll     ? check(rt, 1, promises) :
    ins_rev     ? check(rs, 1, promises) :
    ins_clz     ? check(rt, 1, promises) :
    0
);
```

### T2 bgeal

格式：`bgeal rs rt offset`

按有符号比较 `R[rs]` 和 `R[rt]` 的值，如果前者大于等于后者，
那么分支并链接。否则继续顺序执行。

RTL:
```
if signed(R[rs]) >= signed(R[rt]) then
    nextPC <- PC + 4 + sign_ext(offset || 00)
    R[31] <- PC + 8
```

这个题的考点主要是条件写入。通过判断条件成立才会向 `R[31]` 写入 pc + 8。

如果你也采用了传递标记式的写法，只需要在 D 级判断是否满足条件需要写入就好了。

### T3 lwdx

格式：`lwdx base(5) idx(5) offset(16)`

RTL:
```
addr <- R[base] + sign_ext(offset)
d <- Mem[addr]
k <- ((addr[6:2] ^ d[4:0]) & 0x1E) + idx
R[k] <- d
```

访存题，考点依然是需要推断哪些寄存器可能被写入。

重点在这里：`k <- ((addr[6:2] ^ d[4:0]) & 0x1E) + idx`，与 `0x1E`（也就是 `5'b11110`）会让最后一位确定下来，在与 `idx` 加，这表示我们可以通过 `idx` 的奇偶性推断 `k` 的奇偶性。

所以当 `idx` 为偶数时，`k` 也一定为偶数，奇数寄存器就不会产生依赖，无需阻塞（如果所有寄存器阻塞就会 TLE！）。

推荐使用的写入目标编码方式是用 32 位整数表示**可能写入的寄存器编号集合**，
第 i 位为 1 表示可能写入 i 号寄存器。

这个集合的大小会随着指令在流水级推进逐渐变小，对于 `lwdx` 来说，会在写入 W 级时收缩到 1。

那么在这种模型下，某流水级一条指令可以作为转发的数据提供者，当且仅当该指令的值已经产生 且 写入目标寄存器已经确定。

对于 `lwdx` 来说，进入 IF/ID 后，写入目标的值在 3 个上升沿后产生，最终写入的寄存器编号也是需要 3 个上升沿才能确定，
因此 $t_res$（或者 data promise 模型中的初始 $lag$）因该取两者的最大值，这里为 $3$。

```verilog
target = (
    |{ins_add, ins_sub, ins_sll, ins_or, ins_jalr, ins_sllv}    ? 
        32'b1 << rd :
    |{ins_ori, ins_lw, ins_lui, ins_addi}   ? 
        32'b1 << rt :
    |{ins_jal}  ? 
        32'b1 << 5'd31 :
    ins_lwdx    ? (
        rt[0] == 1'b0 ? 32'h5555_5555 :
        32'haaaa_aaaa
    ) :
    // default
        32'd0 // regard as not writing
);
lag = (
    |{ins_jal, ins_jalr}  ? 
        5'd1 :
    |{ins_add, ins_sub, ins_ori, ins_lui, ins_sll, ins_or, ins_addi, ins_sllv} ? 
        5'd2 :
    |{ins_lw, ins_lwdx} ?
        5'd3 :
    // default
        5'd0
);
```