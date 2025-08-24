declare module 'topojson-client' {
  export function feature(topo: any, obj: any): any;
  export function mesh(topo: any, obj: any, filter?: (a: any, b: any) => boolean): any;
}
