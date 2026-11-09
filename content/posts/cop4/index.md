---
title: "[计组实验] P4考试 MIPS 单周期 CPU 设计"
slug: "cop4"
date: 2026-11-09T21:49:48+08:00
draft: false
tags: ["笔记"]
categories: ["计算机组成"]
author: "PresKirimaSyaro"
showToc: true
TocOpen: false
description: ""
summary: ""
comments: true
weight: 105
---

# 血的教训！！！！

## 本人由于嫌 ISE 太重太史于是卸载了只用 iverilog 进行仿真，导致对 ISE 的导入、仿真操作非常不熟悉，间接导致 P4 考试差点挂掉

## 课下千万要熟悉 ISE 的操作！不要只用 iverilog 一点都不碰 ISE！

## 课下千万要熟悉 ISE 的操作！不要只用 iverilog 一点都不碰 ISE！

## 课下千万要熟悉 ISE 的操作！不要只用 iverilog 一点都不碰 ISE！



所以大家还是要狠狠吃下 ISE 这坨答辩，各个细节都要品尝到位，包括但不限于：
+ 如何向一个新 project 中导入 `.v` 文件（本人 p4 时浪费了 20 分钟一个一个新建模块复制代码）
+ 如何仿真，仿真的常见失败原因以及解决方案

## 考试之前需要做哪些准备

本人由于考试前沉迷 SICP 导致应试准备不足、对软件环境操作不熟悉、看错题目、对底层 RTL 不够熟悉等多种原因，
p4 差点挂掉，在最后4分钟才成功 A 掉两个题，有惊无险地过 P。

在这里，痛定思痛总结出一些计组课上考试前需要做的准备：
+ 写好课下任务，务必完成强测，要对自己的工程特别熟悉，**不要用 AI 完成任何部分**
+ 推荐在测试文档中写好加一条指令有哪些环节，考试每加一条指令就一条一条打勾，不要漏过任何环节
+ 练几道往年题，熟悉一下做题的感觉，毕竟两个小时是很快的
+ 建议实现 **or** 指令，这个指令非常简单，因为在调试时有时你会 `ori` 一个超大的立即数，例如 `ori $t0, $0, 0x10203040`，实际上 MARS 中，汇编是这样实现的：
```mips
lui $1, 0x1020
ori $1, 0x3040
or  $8, $0, $1
```
这里会用 or 指令把 `$at` 的临时值赋给 `$t0`。而不是直接对 `$t0` 使用 `lui` + `ori`。

我由于没有意识到这个问题，在 T1 时写了 ori 超大立即数，但是我的 cpu 没有实现 or，因此调试了好久。

同理你可以实现 addi，xori，用其他方式获得大立即数，或者你足够清醒，每次都记得写 `lui` + `ori`，那就 OK。

### 今时不同往日，题目变难，verilog 的语法需要了解更多，掌握更熟练，才能顺滑地过p

必须新增掌握的语法：
+ 循环的使用
+ 偏移切片的写法 -> `[a+:8]` 这种方式进行切片，`[a+7:a]` 会报错

建议掌握的语法：
+ function 的用法

## P4 课上考试

这次考试 T3 实际上非常简单，而我由于没有考试前看题导致去做了较难的 T1、T2，卡在 T1 的坑里好久，最后只做出来了两个题，由于急着交卷做错了一个选择……十分狼狈。如果先做了简单的 T3 就不一样了

### T1 NIBSRT

添加指令 `NIBSRT $rd, $rs, $rt`

指令格式 `000000 rs(5) rt(5) rd(5) 00000 NIBSRT(6)`

将 `GPR[rs]` 每四位分成一个无符号段，共 8 段，并根据 `rt` 从小到大、从大到小排序，最后按照排序后的顺序写入 `GPR[rd]`

RTL:

`count_ones` 表示计算 1 的个数

```
b_k <- GPR[rs][31 - 4*k : 28 - 4*k], k = 0, 1, ..., 7
if count_ones(rt) mod 2 == 1 then
    c_i <- {b_k} 中第 i 小的 4 位无符号段
else
    c_i <- {b_k} 中第 i 大的 4 位无符号段
GPR[rd] <- c_0 || c_1 || ... || c_7
```

例如 `GPR[rs] = 32'h45671234`，`rt = 5'b11010`

那么 `GPR[rd] <- 32'12344567`

#### Solution

这个题主要的坑点在于判断的是 `rt` 不是 `GPR[rt]`。**大家一定要仔细看题面 RTL 啊**

在 ALU 中实现分段、排序、拼接的 function，这样直接使用就很好了

```verilog
`include "constants.vh"

module ALU (
	input [31:0] A,
	input [31:0] B,
	input [4:0] Mod,
	output reg [31:0] C,
	output reg zero
);

function [31:0] nibsort(input [31:0] arr, input p);
integer i, j;
reg [3:0] b[0:7];
reg [3:0] t[0:15];
begin
	for (i = 0; i < 16; i = i + 1) t[i] = 0;
	for (i = 0; i < 8; i = i + 1) begin
		b[i] = arr[28 - 4*i +: 4];
		t[b[i]] = t[b[i]] + 1;
	end
	j = 0;
	for (i = 0; i < 16; i = i + 1) begin
		while (t[i] > 0) begin
			b[j] = i;
			j = j + 1;
			t[i] = t[i] - 1;
		end
	end
	nibsort = p ? {b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8]} :
		{b[7], b[6], b[5], b[4], b[3], b[2], b[1], b[0]};
end
endfunction

always @(*) begin
	case (Mod) 
		`alu_add:	C = A + B;
		`alu_sub: 	C = A - B;
		`alu_or:	C = A | B;
		`alu_lui:	C = {B[15:0], {16{1'b0}}};
		`alu_sll:	C = B << A;
		`alu_nibsrt:	C = nibsort(A, ^B[4:0]);
		default:
			C = 32'd0;
	endcase

	case (Mod)
		`alu_eq:	zero = (A == B);
		default:
			zero = 1'b0;
	endcase
end
endmodule
```

Controller 里专门给让这个指令把 `rt` 送入 `ALU/B` 处理就好了

### T2 BLEZAL

添加指令 `blezal $rs, 00000, offset`

指令格式：`BLEZAL rs(5) 00000 imm(16)`

RTL:

记 sign_ext8 为将 8 位立即数符号拓展为 32 位
```
next <- PC + 4
if GPR[rs] < 0 then
    disp <- sign_ext8(offset[15:8])
    GPR[31] <- next
    PC <- PC + 4 + (disp << 2)
else if GPR[rs] = 0 then
    disp <- sign_ext8(offset[7:0])
    GPR[31] <- next
    PC <- PC + 4 + (disp << 2)
else
    PC <- next
```

#### Solution

虽然看起来有点复杂，但是这个指令的跳转方式其实和 `beq` 一模一样，都是符号拓展、左移两位，计算方式也相同

所以我们可以将这条指令嫁接到 beq 的路径上，与 beq 共享一个 NPC_sel，将 NPC 的 imm16 来源选为 ALU/C

至于跳转的条件，同样用 zero 表示，这时的 ALU 的功能是：

输入 `GPR[rs]`、`EXT/ext32`，让 32 位输出端口提供 `disp`，`zero` 则表示条件 `GPR[rs] <= 0`

而 `$ra` 是否写由 `zero` 决定，所以我们可以像 P3 那样把 zero 接到控制器里，让它参与其他控制信号的生成

由于实现简单就不给代码了...

### T3 LWSEL

我没有做！

实际上是非常简单的题，但是由于开题顺序不佳，导致错过了这个题。只能说之后那道题还是都看一遍再下手吧，挑出比较简单的两个题先做了保证自己不会挂 P