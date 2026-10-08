	.globl _start
	.text
_start:
	mov $1, %eax
	mov $1, %edi
	lea msg(%rip), %rsi
	mov $13, %edx
	syscall
	mov $60, %eax
	xor %edi, %edi
	syscall
msg:
	.ascii "hello x86-64\n"
