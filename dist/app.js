// Bundle navigateur autonome (copie des classes src/, sans Buffer Node).
// Affiche sur <canvas>, logs dans <pre>. Homebrew démo embarqué.

const MSG = 'HELLO PS5 - homebrew demo OK\nGPU rect drawn - CPU IR running\n';
const MSG_BYTES = Array.from(new TextEncoder().encode(MSG));
const DEMO = {
  magic: 'PS5-DEMO-1',
  name: 'demo_boot — hello + gpu rect',
  program: [
    { op: 'MOV', dst: 0, imm: 0x1000 },
    { op: 'MOV', dst: 1, imm: MSG_BYTES.length },
    { op: 'SYSCALL', id: 16 },
    { op: 'MOV', dst: 0, imm: 0x141a26 },
    { op: 'SYSCALL', id: 17 },
    { op: 'MOV', dst: 0, imm: 40 },
    { op: 'MOV', dst: 1, imm: 50 },
    { op: 'MOV', dst: 2, imm: 240 },
    { op: 'MOV', dst: 3, imm: 80 },
    { op: 'MOV', dst: 4, imm: 0x2e6db4 },
    { op: 'SYSCALL', id: 18 },
    { op: 'MOV', dst: 0, imm: 0 },
    { op: 'SYSCALL', id: 0 },
    { op: 'HALT', code: 0 },
  ],
  data: [{ addr: 0x1000, bytes: MSG_BYTES }],
};

class Memory {
  constructor(size = 16 * 1024 * 1024) { this.size = size; this.buf = new Uint8Array(size); }
  check(a, l = 1) { if (a < 0 || a + l > this.size) throw new Error('MMU fault 0x' + a.toString(16)); }
  readU32(a) { this.check(a, 4); return (this.buf[a] | (this.buf[a+1]<<8) | (this.buf[a+2]<<16) | (this.buf[a+3]<<24)) >>> 0; }
  writeU32(a, v) { this.check(a, 4); v >>>= 0; this.buf[a]=v&255; this.buf[a+1]=(v>>>8)&255; this.buf[a+2]=(v>>>16)&255; this.buf[a+3]=(v>>>24)&255; }
  writeBytes(a, b) { this.check(a, b.length); this.buf.set(b, a); }
  readString(a, l) { this.check(a, l); return new TextDecoder().decode(this.buf.slice(a, a+l)); }
}
function unpack(c){return [(c>>>16)&255,(c>>>8)&255,c&255];}
class Gpu {
  constructor(w=320,h=180){this.width=w;this.height=h;this.fb=new Uint8ClampedArray(w*h*4);this.clear(0x0b0e14);}
  clear(c=0){const [r,g,b]=unpack(c>>>0);for(let i=0;i<this.fb.length;i+=4){this.fb[i]=r;this.fb[i+1]=g;this.fb[i+2]=b;this.fb[i+3]=255;}}
  rect(x,y,w,h,c){const [r,g,b]=unpack(c>>>0);for(let py=Math.max(0,y);py<Math.min(this.height,y+h);py++)for(let px=Math.max(0,x);px<Math.min(this.width,x+w);px++){const o=(py*this.width+px)*4;this.fb[o]=r;this.fb[o+1]=g;this.fb[o+2]=b;this.fb[o+3]=255;}}
}
class Kernel {
  constructor(m,g){this.m=m;this.g=g;this.reset();}
  reset(){this.stdout='';this.log=[];this.exited=false;this.exitCode=0;}
  syscall(id,regs){
    if(id===0){this.exited=true;this.exitCode=regs[0]>>>0;this.log.push('exit('+this.exitCode+')');}
    else if(id===16){this.stdout+=this.m.readString(regs[0]>>>0,regs[1]>>>0);}
    else if(id===17){this.g.clear(regs[0]>>>0);this.log.push('gpu.clear');}
    else if(id===18){this.g.rect(regs[0]>>>0,regs[1]>>>0,regs[2]>>>0,regs[3]>>>0,regs[4]>>>0);this.log.push('gpu.rect');}
    else throw new Error('syscall '+id+' non implante');
  }
}
class Cpu {
  constructor(m,k){this.m=m;this.k=k;this.program=[];this.regs=new Array(8).fill(0);this.pc=0;this.halted=false;this.cycles=0;}
  reset(p){this.program=p;this.regs.fill(0);this.pc=0;this.halted=false;this.cycles=0;}
  step(){
    if(this.halted)return false;
    const ins=this.program[this.pc];this.cycles++;
    const R=this.regs;
    switch(ins.op){
      case 'MOV':R[ins.dst]=ins.imm>>>0;this.pc++;break;
      case 'ADD':R[ins.dst]=(R[ins.a]+R[ins.b])>>>0;this.pc++;break;
      case 'SUB':R[ins.dst]=(R[ins.a]-R[ins.b])>>>0;this.pc++;break;
      case 'JMP':this.pc=ins.addr;break;
      case 'JZ':this.pc=(R[ins.reg]===0)?ins.addr:this.pc+1;break;
      case 'JNZ':this.pc=(R[ins.reg]!==0)?ins.addr:this.pc+1;break;
      case 'SYSCALL':this.k.syscall(ins.id,R);this.pc++;if(this.k.exited)this.halted=true;break;
      case 'HALT':this.halted=true;this.pc++;break;
      default:this.pc++;break;
    }
    return !this.halted;
  }
}

const mem=new Memory();const gpu=new Gpu();const ker=new Kernel(mem,gpu);const cpu=new Cpu(mem,gpu && ker);
let booted=false;
const canvas=document.getElementById('screen');
const ctx=canvas.getContext('2d');
const logEl=document.getElementById('log');
const regsEl=document.getElementById('regs');
function draw(){const img=new ImageData(new Uint8ClampedArray(gpu.fb),gpu.width,gpu.height);const off=document.createElement('canvas');off.width=gpu.width;off.height=gpu.height;off.getContext('2d').putImageData(img,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(off,0,0,canvas.width,canvas.height);}
function logs(){logEl.textContent=['[BOOT] homebrew: '+DEMO.name,'[STDOUT]\n'+ker.stdout,'[KLOG] '+ker.log.join(' | '),'cycles='+cpu.cycles+' pc='+cpu.pc+' halted='+cpu.halted].join('\n');regsEl.textContent=cpu.regs.map((v,i)=>'R'+i+'='+v).join(' ');}
function boot(){mem.buf.fill(0);ker.reset();gpu.clear(0x0b0e14);for(const s of DEMO.data)mem.writeBytes(s.addr,Uint8Array.from(s.bytes));cpu.reset(DEMO.program);booted=true;draw();logs();}
document.getElementById('bBoot').onclick=()=>{boot();};
document.getElementById('bStep').onclick=()=>{if(!booted)boot();try{cpu.step();}catch(e){ker.log.push(String(e));}draw();logs();};
document.getElementById('bRun').onclick=()=>{if(!booted)boot();try{let n=0;while(!cpu.halted&&n<100000){cpu.step();n++;}}catch(e){ker.log.push(String(e));}draw();logs();};
document.getElementById('bReset').onclick=()=>{boot();};
boot();
