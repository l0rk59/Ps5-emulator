	.globl _start
	.text
_start:
	mov $3, %ecx
	xor %eax, %eax
loop:
	add %ecx, %eax
	dec %ecx
	jnz loop
	mov %eax, %edi
	mov $60, %eax
	syscall
