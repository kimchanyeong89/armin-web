declare module 'jscanify' {
    export default class jscanify {
        highlightPaper(image: HTMLImageElement, options?: any): HTMLCanvasElement;
        extractPaper(image: HTMLImageElement, resultWidth: number, resultHeight: number, cornerPoints?: any): HTMLCanvasElement;
        findPaper(image: HTMLImageElement): any;
        constructor();
    }
}
