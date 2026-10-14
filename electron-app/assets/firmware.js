"use strict";
/* Porte JS puro do build_firmware.py (mesma lógica, mesmos bytes).
   Sem Python, sem dependência externa: roda dentro do app. */
const PAD = hex("a74f9dd95066da064987ae89848f3e28d77c3e2ffdc9905313252ae3e0538173");
const IDLE = hex("3927beae2bc2b43ac25011b293f79d6a041b00f077f9c274b82331175923e68b");
const SYNC = hex("3b27627ec383");
const FRAME = 32;
const CLIPS = {
  EN: [[864,3680],[5120,3680],[9376,4096],[14016,4672],[19232,4640],[24448,4576],[29376,3552],[33440,3008],[36736,3968],[41376,3904],[46016,3936],[50112,3008],[53408,3872],[57856,3328],[61536,3712],[65792,4480],[70432,4000],[75072,4832]],
  CN: [[1056,6176],[8960,6176],[16672,3360],[20192,4128],[25056,4288],[31040,2944],[34336,3104],[39168,3520],[44192,3040],[47392,3008],[50560,3712],[54624,3520],[59840,3712],[65056,2752],[69312,2752],[73376,3872],[77792,4256],[83584,4832]],
};
function hex(s){const b=new Uint8Array(s.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(s.substr(i*2,2),16);return b;}
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function xorBuf(buf){const o=new Uint8Array(buf.length);for(let i=0;i<buf.length;i++)o[i]=buf[i]^PAD[i%32];return o;}
function u32le(u8,off){return (u8[off]|(u8[off+1]<<8)|(u8[off+2]<<16)|(u8[off+3]<<24))>>>0;}
function setU32le(u8,off,v){u8[off]=v&0xFF;u8[off+1]=(v>>>8)&0xFF;u8[off+2]=(v>>>16)&0xFF;u8[off+3]=(v>>>24)&0xFF;}
function eq(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function readDir(d){const e=[];let off=0x200;while(off+32<=d.length){const nm=d.subarray(off,off+16);if(nm[0]===0)break;
const o=u32le(d,off+16),sz=u32le(d,off+20),crc=u32le(d,off+28);if(o===0&&sz===0)break;
let s="";for(let i=0;i<16&&nm[i]!==0;i++)s+=String.fromCharCode(nm[i]);
e.push({name:s,off:o,size:sz,crc_off:off+28,crc:crc});off+=32;}return e;}
function parse(stock){
if(!(stock[0]===0x41&&stock[1]===0x4F&&stock[2]===0x54&&stock[3]===0x41))throw new Error("not an AOTA firmware image");
const d=readDir(stock);
const tone=d.find(x=>x.name.toLowerCase()==="tone.bin");if(!tone)throw new Error("tone.bin nao encontrado no diretorio AOTA");
const xml=d.find(x=>x.name.toLowerCase().endsWith("ota.xml"));if(!xml)throw new Error("ota.xml nao encontrado no diretorio AOTA");
const enc=stock.subarray(tone.off,tone.off+tone.size);
const plain=xorBuf(enc);
if(!(plain[0]===0x73&&plain[1]===0x64&&plain[2]===0x66&&plain[3]===0x73))throw new Error("tone.bin did not decrypt to an sdfs bank -- unexpected firmware");
let variant=null,clips=null;
for(const k of Object.keys(CLIPS)){const o=CLIPS[k][0][0];if(eq(plain.subarray(o,o+SYNC.length),SYNC)){variant=k;clips=CLIPS[k];break;}}
if(!variant)throw new Error("could not match a known clip table to this firmware -- it may be a newer version or a different product; see docs/clip-map.md to find clips by bisection");
return {dir:d,tone,xml,plain,variant,clips};
}
function listText(stock){
const p=parse(stock);const L=[];
L.push("matched "+p.variant+" clip table ("+p.clips.length+" clips)");
p.clips.forEach((c,i)=>{let tag="";if(p.variant==="EN"&&i===8)tag="  <- mic on";if(p.variant==="EN"&&i===9)tag="  <- mic off";
L.push("  clip "+String(i).padStart(2," ")+"  offset 0x"+c[0].toString(16).padStart(5,"0")+"  "+String(Math.floor(c[1]/FRAME)).padStart(3," ")+" frames  ~"+(c[1]/32*0.030).toFixed(1)+"s"+tag);});
return {variant:p.variant,text:L.join("\n"),clips:p.clips.length};
}
function silence(plain,clips,targets){
const out=new Uint8Array(plain);out.set(plain);
for(const idx of targets){if(idx<0||idx>=clips.length)throw new Error("clip "+idx+" fora do intervalo (0.."+(clips.length-1)+")");
const o=clips[idx][0],ln=clips[idx][1];
if(!eq(out.subarray(o,o+SYNC.length),SYNC))throw new Error("clip "+idx+" does not start with a sync frame -- wrong firmware version? run without indices to list, and see docs/clip-map.md");
for(let k=1;k<Math.floor(ln/FRAME);k++)out.set(IDLE,o+k*FRAME);}
return out;
}
function findBytes(hay,needle,from){outer:for(let i=from||0;i<=hay.length-needle.length;i++){for(let j=0;j<needle.length;j++)if(hay[i+j]!==needle[j])continue outer;return i;}return -1;}
function repack(stock,newToneEnc){
const data=new Uint8Array(stock.length);data.set(stock);
const d=readDir(stock);
const tone=d.find(x=>x.name.toLowerCase()==="tone.bin");
const xml=d.find(x=>x.name.toLowerCase().endsWith("ota.xml"));
if(newToneEnc.length!==tone.size)throw new Error("tone.bin com tamanho inesperado");
data.set(newToneEnc,tone.off);
const tcrc=crc32(newToneEnc);setU32le(data,tone.crc_off,tcrc);
const xoff=xml.off,xsz=xml.size;
const needle=new TextEncoder().encode("tone.bin"),op=new TextEncoder().encode("<checksum>"),cl=new TextEncoder().encode("</checksum>");
const i=findBytes(data.subarray(xoff,xoff+xsz),needle,0);
const a0=findBytes(data.subarray(xoff,xoff+xsz),op,i)+op.length;
const b0=findBytes(data.subarray(xoff,xoff+xsz),cl,a0);
const txt="0x"+tcrc.toString(16).padStart(8,"0");
if(b0-a0!==txt.length)throw new Error("unexpected checksum field width in ota.xml");
for(let k=0;k<txt.length;k++)data[xoff+a0+k]=txt.charCodeAt(k);
const xcrc=crc32(data.subarray(xoff,xoff+xsz));setU32le(data,xml.crc_off,xcrc);
setU32le(data,0x04,crc32(data.subarray(0x08,0x400)));
return data;
}
function buildAll(stock,targets){
const p=parse(stock);
const noop=repack(stock,xorBuf(p.plain));
if(!eq(noop,stock))throw new Error("internal error: no-op repack is not byte-identical to stock");
const out=repack(stock,xorBuf(silence(p.plain,p.clips,targets)));
return {variant:p.variant,noop,silenced:out};
}
window.FirmwareJS={parse,listText,buildAll,crc32};
