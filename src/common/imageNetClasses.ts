import imageNetClasses from "@/data/imageNetClasses.json";
const idToWnid: Record<string, string> = imageNetClasses;
const wnidToId = new Map<string, string>(Object.entries(idToWnid).map(([id, wnid]) => [wnid, id]));

export function getIdFromWnid(wnid: string): string | undefined {
  return wnidToId.get(wnid);
}

export function getWnidFromId(id: string): string {
  return idToWnid[id];
}
