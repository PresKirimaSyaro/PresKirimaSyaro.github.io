---
title: "[计组实验] P4课下 Verilog 单周期 CPU 设计"
slug: "co-verilog-cpu"
date: 2026-11-06T19:47:56+08:00
draft: false
tags: ["笔记"]
categories: ["计算机组成"]
author: "PresKirimaSyaro"
showToc: true
TocOpen: false
description: ""
summary: ""
comments: true
weight: 104
---

## 一些 Verilog 语法糖

### 向量切片的偏移写法：
```verilog
wire [31:0] PC;
wire [3:0] pc_high4, pc_low4;
assign pc_high4 = PC[31-: 4];   // 向下截取 4 位，等价于 PC[31:28]
assign pc_low4 = PC[0+: 4];     // 向上截取 4 位，等价于 PC[3:0]
```

### 用规约运算符表达逻辑：
```verilog
// ins_add, ins_sub, ... 都是 1 bit wire 信号
assign cont_GRF_WE = |{
	ins_add, ins_sub, ins_ori, ins_lw, 
	ins_lui, ins_jal, ins_sll
};
```

### 用与控制符号拓展、零拓展：
```verilog
module EXT (
	input [15:0]    imm16,
	input           sign,
	output [31:0]   ext16
);

assign ext16 = {
	{16{sign & imm16[15]}},
	imm16
};
endmodule
```

### 位拼接运算符拼接左值还是左值

```verilog
wire [5:0] opcode, funct;
wire [4:0] rs, rt, rd, shamt;
assign {opcode, rs, rt, rd, shamt, funct} = instr;
```

很方便像这样进行指令拆分

### 头文件

verilog 可以像 c 语言一样写 `.vh` 头文件，在 `.v` 文件中 include。
在写 cpu 的时候可以将一些编码和信号的宏写入头文件，提高代码的可读性

```verilog
// 文件：constants.vh

`ifndef constants_vh // 头文件守卫，如果没有定义这个宏就说明没有包含过
`define constants_vh

// ALU_MOD
`define alu_add 5'd0
`define alu_sub 5'd1
`define alu_or  5'd2
`define alu_eq  5'd3
`define alu_lui 5'd4
`define alu_sll 5'd5

// NPC_SELECTION
`define npc_pc4 	2'd0
`define npc_imm16	2'd1
`define npc_imm26	2'd2
`define npc_reg		2'd3

// DM_MOD
`define dm_by_word	2'd0
`define dm_by_hfwd	2'd1
`define dm_by_byte	2'd2

// CONTROLLER

`define funct_add	6'b10_0000
`define funct_sub	6'b10_0010
`define funct_jr	6'b00_1000
`define funct_sll	6'b00_0000

`define opcode_ori	6'b00_1101
`define opcode_lw	6'b10_0011
`define opcode_sw	6'b10_1011
`define opcode_beq	6'b00_0100
`define opcode_lui	6'b00_1111
`define opcode_jal	6'b00_0011

`define mux_GRF_A3__rd	2'd0
`define mux_GRF_A3__rt	2'd1
`define mux_GRF_A3__31	2'd2

`define mux_GRF_WD__DM_RD	2'd0
`define mux_GRF_WD__pc4		2'd1
`define mux_GRF_WD__ALU_C	2'd2

`define mux_ALU_A__GRF_RD1	2'd0
`define mux_ALU_A__shamt	2'd1

`define mux_ALU_B__GRF_RD2	2'd0
`define mux_ALU_B__ext16	2'd1

`endif
```

在 `.v` 文件中只需要：
```verilog
`include "constants.vh"

module ...
...
endmodule
```

## MIPS 单周期 CPU 设计

使用的是比较普通的架构。这里主要介绍一下 DM 和 Controller 的写法

另一种架构 verilog 的绿框法版本可以看我舍友的博客：
[P4 单周期 CPU 设计文档（Verilog）](https://zaciowocky.github.io/2026/11/04/co-p4-single-cycle-cpu/)

### DM

| 端口 | 方向 | 位宽 | 简要含义 |
| --- | --- | ---: | --- |
| `DM/Addr` | 输入 | 32 | 访存字节地址，来自 `ALU/C` |
| `DM/WD` | 输入 | 32 | 写入数据，来自 `GRF/RD2` |
| `DM/WE` | 输入 | 1 | 写使能 |
| `DM/Mod` | 输入 | 2 | 访问宽度选择 |
| `DM/sign` | 输入 | 1 | 字节、半字读出的扩展方式 |
| `DM/clk`、`DM/reset` | 输入 | 1 | 时钟、高电平同步清零 |
| `DM/disp_PC` | 输入 | 32 | 整字写入仿真日志使用的当前指令地址 |
| `DM/RD` | 输出 | 32 | 读出的数据，供 `lw` 写回 |

这个模块依旧实现了对于按字节、按半字访存的支持。

verilog 用向量数组模拟内存，我这里使用了 `reg [31:0] mem[0:3072];`

那么对于不按整字访存的操作，定位的方式是先根据字地址找到对应的字，再根据字节地址后两位确定截取那一段

下面这个例子，我们假设字地址只有两位，执行这样的 mips 程序：

```assembly
li	$t0, 0x12345678
li	$t1, 0x10203040
sw	$t0, 0($zero)
sw	$t1, 4($zero)
```

内存会变成这样：

| 字地址       | 00            | 00             | 00              | 00              | 01   | 01   | 01   | 01   |
| ------------ | ------------- | -------------- | --------------- | --------------- | ---- | ---- | ---- | ---- |
| 字节地址     | 0000          | 0001           | 0010            | 0011            | 0100 | 0101 | 0110 | 0111 |
| 值           | 0x78          | 0x56           | 0x34            | 0x12            | 0x40 | 0x30 | 0x20 | 0x10 |
| verilog 切片 | `mem[0][7:0]` | `mem[0][15:8]` | `mem[0][23:16]` | `mem[0][31:24]` | `mem[1][7:0]` | `mem[1][15:8]` | `mem[1][23:16]` | `mem[1][31:24]`|

再执行：

```assembly
lhu $s0, 2($zero)
lbu $s1, 5($zero)
```

`2($zero)` 会从字节地址 `0010` 的位置开始读。所以 `$s0` 的值就等于 `0x00001234`（由于小端序，低地址放的是位权低的字节，记住两个都是低就好了）

`5($zero)` 会直接读字节地址是 `0101` 的字节，所以 `$s1` 的值是 `0x000000030`

因此可以这样简单地对应：

| 字节地址后两位 | 按半字访问的切片 | 按字节访问的切片 |
| :------------: | :--------------: | :--------------: |
|      `00`      |    `[0+:16]`     |     `[0+:8]`     |
|      `01`      |        /         |     `[8+:8]`     |
|      `10`      |    `[16+:16]`    |    `[16+:8]`     |
|      `11`      |        /         |     `24+:8`      |


```verilog
`include "constants.vh"

module DM (
	input [31:0]		Addr,
	input [31:0]		WD,
	input				WE,
	input [1:0]			Mod,
	input				sign,
	output reg [31:0]	RD,
	
	input	clk,
	input	reset,

	input [31:0]	disp_PC
);

reg [31:0] mem[0:3072];

wire [11:0] word_addr;
wire [1:0] 	byte_code;

assign {word_addr, byte_code} = Addr[0+:14];

/*==================== 写部分 ====================*/
integer i;
always @(posedge clk) begin
	if (reset) begin
		for (i = 0; i < 3072; i = i + 1)	
			mem[i] <= 32'd0;
	end
	else begin
		if (WE) begin
			case (Mod)
				`dm_by_word: begin
					$display("@%h: *%h <= %h", disp_PC, Addr, WD);
					mem[word_addr] <= WD;
				end
				`dm_by_hfwd: begin
                    // 按半字访存，00 对应起点 0, 10 对应起点 16
					mem[word_addr][{byte_code[1], 4'b0000} +: 16] <= WD[0+:16];
				end
				`dm_by_byte: begin
                    // 按字节访存
					mem[word_addr][{byte_code, 3'b000} +: 8] <= WD[0+:8];
				end
				default:;

			endcase
		end
	end
end

/*==================== 读部分 ====================*/
reg [15:0]	hfwd_RD;
reg [7:0]	byte_RD;
always @(*) begin
	case (Mod)
		`dm_by_word: begin
			hfwd_RD = 0;
			byte_RD = 0;
			RD 		= mem[word_addr];
		end

		`dm_by_hfwd: begin
			hfwd_RD = mem[word_addr][{byte_code[1], 4'b0000} +: 16];
			byte_RD = 0;
			RD = {
				{16{sign & hfwd_RD[15]}},
				hfwd_RD
			};
		end
		`dm_by_byte: begin
			hfwd_RD = 0;
			byte_RD = mem[word_addr][{byte_code, 3'b000} +: 8];
			RD = {
				{24{sign & byte_RD[7]}},
				byte_RD
			};
		end
	endcase
end
endmodule
```

### Controller

```verilog
`include "constants.vh"

module Controller (
	input [5:0]		opcode,
	input [5:0]		funct,

	output [1:0]	cont_NPC_sel,
	output			cont_EXT_sign,
	output			cont_GRF_WE,
	output			cont_DM_WE,
	output [4:0]	cont_ALU_Mod,
	output [1:0]	cont_DM_Mod,
	output 			cont_DM_sign,

	output [1:0]	mux_GRF_A3,
	output [1:0]	mux_GRF_WD,
	output [1:0]	mux_ALU_A,
	output [1:0]	mux_ALU_B
);

// 识别指令，独热信号
wire ins_add, ins_sub, ins_ori, ins_lw, ins_sw, ins_beq, ins_lui, ins_jal, ins_jr, ins_sll;
assign ins_add 	= (~|opcode) && funct == `funct_add;
assign ins_sub 	= (~|opcode) && funct == `funct_sub;
assign ins_ori 	= opcode == `opcode_ori;
assign ins_lw	= opcode == `opcode_lw;
assign ins_sw	= opcode == `opcode_sw;
assign ins_beq	= opcode == `opcode_beq;
assign ins_lui	= opcode == `opcode_lui;
assign ins_jal	= opcode == `opcode_jal;
assign ins_jr	= (~|opcode) && funct == `funct_jr;
assign ins_sll	= (~|opcode) && funct == `funct_sll;

assign cont_NPC_sel = (
	ins_beq	? `npc_imm16	:
	ins_jal	? `npc_imm26	:
	ins_jr 	? `npc_reg		:
	`npc_pc4
);
assign cont_EXT_sign = ins_lw | ins_sw;
assign cont_GRF_WE = |{
	ins_add, ins_sub, ins_ori, ins_lw, 
	ins_lui, ins_jal, ins_sll
};
assign cont_DM_WE = ins_sw;
assign cont_ALU_Mod = (
	ins_sub ? `alu_sub	:
	ins_ori ? `alu_or	:
	ins_beq ? `alu_eq	:
	ins_lui ? `alu_lui	:
	ins_sll ? `alu_sll 	:
	`alu_add
);
assign cont_DM_Mod = `dm_by_word;
assign cont_DM_sign = 1'b0;

assign mux_GRF_A3 = (
	|{ins_ori, ins_lw, ins_lui} ?
		`mux_GRF_A3__rt	:
	|{ins_jal} ?
		`mux_GRF_A3__31 :
	// default:
		`mux_GRF_A3__rd
);
assign mux_GRF_WD = (
	|{ins_lw} ?
		`mux_GRF_WD__DM_RD :
	|{ins_jal} ?
		`mux_GRF_WD__pc4 :
	// default:
		`mux_GRF_WD__ALU_C
);
assign mux_ALU_A = (
	|{ins_sll} ?
		`mux_ALU_A__shamt :
	// default:
		`mux_ALU_A__GRF_RD1
);
assign mux_ALU_B = (
	|{ins_ori, ins_lw, ins_sw, ins_lui} ?
		`mux_ALU_B__ext16 :
	// default:
		`mux_ALU_B__GRF_RD2
);

endmodule
```