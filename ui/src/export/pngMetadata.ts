const concat=(...parts:Uint8Array[])=>{const result=new Uint8Array(parts.reduce((sum,item)=>sum+item.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;};
const uint32=(value:number)=>new Uint8Array([(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255]);
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
const crc32=(data:Uint8Array)=>{let crc=0xffffffff;for(const byte of data)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;};
const chunk=(type:string,data:Uint8Array)=>{const typeBytes=new TextEncoder().encode(type),body=concat(typeBytes,data);return concat(uint32(data.length),body,uint32(crc32(body)));};

export async function embedWorkflow(blob:Blob,workflowJson:string):Promise<Blob>{
    if(!workflowJson)return blob;
    const bytes=new Uint8Array(await blob.arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
    if(signature.some((value,index)=>bytes[index]!==value))throw new Error("Workflow metadata can only be embedded in a PNG.");
    const keyword=new TextEncoder().encode("workflow"),text=new TextEncoder().encode(workflowJson),payload=concat(keyword,new Uint8Array([0]),text),textChunk=chunk("tEXt",payload);
    let offset=8;
    while(offset+12<=bytes.length){
        const length=((bytes[offset]<<24)>>>0)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];
        const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
        if(type==="IEND")return new Blob([concat(bytes.subarray(0,offset),textChunk,bytes.subarray(offset))],{type:"image/png"});
        offset+=12+length;
    }
    throw new Error("PNG does not contain an IEND chunk.");
}

export async function readWorkflowText(blob:Blob):Promise<string|null>{
    const bytes=new Uint8Array(await blob.arrayBuffer());let offset=8;
    while(offset+12<=bytes.length){const length=((bytes[offset]<<24)>>>0)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3],type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(type==="tEXt"){const data=bytes.subarray(offset+8,offset+8+length),zero=data.indexOf(0);if(zero>=0&&new TextDecoder().decode(data.subarray(0,zero))==="workflow")return new TextDecoder().decode(data.subarray(zero+1));}offset+=12+length;}return null;
}
