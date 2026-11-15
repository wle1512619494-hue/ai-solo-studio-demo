import fs from "node:fs/promises";
import path from "node:path";

export type KnowledgeChunk = { id:string; documentId:string; documentName:string; content:string; page:number|null };
export type KnowledgeDocument = { id:string; name:string; type:string; size:number; createdAt:string; chunks:KnowledgeChunk[] };
const DATA_DIR=path.join(process.cwd(),"data");
const DB_FILE=path.join(DATA_DIR,"knowledge.json");
async function readAll():Promise<KnowledgeDocument[]> { try { return JSON.parse(await fs.readFile(DB_FILE,"utf8")); } catch { return []; } }
async function writeAll(items:KnowledgeDocument[]) { await fs.mkdir(DATA_DIR,{recursive:true}); await fs.writeFile(DB_FILE,JSON.stringify(items,null,2),"utf8"); }
export async function listDocuments(){ return (await readAll()).map(({chunks,...doc})=>({...doc,chunkCount:chunks.length})); }
export async function addDocument(doc:KnowledgeDocument){const all=await readAll();all.unshift(doc);await writeAll(all);return doc;}
export async function removeDocument(id:string){const all=await readAll();await writeAll(all.filter(x=>x.id!==id));}
export async function searchKnowledge(query:string,limit=4){const all=await readAll();const terms=Array.from(new Set(query.toLowerCase().match(/[a-z0-9_-]+|[\u4e00-\u9fff]{2,}/g)||[])).filter(x=>x.length>1);if(!terms.length)return [];const scored=all.flatMap(d=>d.chunks.map(c=>{const text=c.content.toLowerCase();const score=terms.reduce((n,t)=>n+(text.includes(t)?(t.length>2?2:1):0),0);return {...c,score};})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);return scored.slice(0,limit);}
export async function documentCount(){return (await readAll()).length;}
export function splitText(text:string,chunkSize=700,overlap=100){const clean=text.replace(/\r/g,"").replace(/[ \t]+/g," ").trim();const out:string[]=[];for(let start=0;start<clean.length;start+=chunkSize-overlap){const part=clean.slice(start,start+chunkSize).trim();if(part)out.push(part);if(start+chunkSize>=clean.length)break;}return out;}
