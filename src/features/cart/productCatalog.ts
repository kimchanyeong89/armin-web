export type ProductTypeOption = {
  id: "poster" | "frame" | "canvas" | "fabric";
  name: string;
  nameEn: string;
  marker: string;
  basePrice: number;
};

export type ProductSizeOption = {
  id: "S" | "M" | "L" | "XL" | "XXL";
  longEdge: number;
  multiplier: number;
  name: string;
};

export const PRODUCT_TYPES: ProductTypeOption[] = [
  { id: "poster", name: "포스터", nameEn: "Poster", marker: "PO", basePrice: 15000 },
  { id: "frame", name: "액자", nameEn: "Framed", marker: "FR", basePrice: 45000 },
  { id: "canvas", name: "캔버스", nameEn: "Canvas", marker: "CV", basePrice: 65000 },
  { id: "fabric", name: "패브릭 포스터", nameEn: "Fabric", marker: "FB", basePrice: 35000 },
];

export const BASE_SIZES: Omit<ProductSizeOption, "name">[] = [
  { id: "S", longEdge: 30, multiplier: 1 },
  { id: "M", longEdge: 50, multiplier: 1.5 },
  { id: "L", longEdge: 70, multiplier: 2.2 },
  { id: "XL", longEdge: 100, multiplier: 3.5 },
  { id: "XXL", longEdge: 150, multiplier: 5.0 },
];

export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(price);
};

export function calculateSizesByRatio(ratio: number): ProductSizeOption[] {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return BASE_SIZES.map((base) => {
    let w;
    let h;
    if (safeRatio >= 1) {
      w = base.longEdge;
      h = Math.round(base.longEdge / safeRatio);
    } else {
      h = base.longEdge;
      w = Math.round(base.longEdge * safeRatio);
    }
    return {
      ...base,
      name: `${base.id} (${w}x${h}cm)`,
    };
  });
}

export function getDynamicSizes(artwork: { dimension?: string; width?: number; height?: number }): ProductSizeOption[] {
  let ratio = 1;

  if (artwork.width && artwork.height && artwork.height !== 0) {
    ratio = artwork.width / artwork.height;
  } else if (artwork.dimension) {
    const nums = artwork.dimension.match(/[\d.]+/g)?.map(Number).filter((n) => !isNaN(n));
    if (nums && nums.length >= 2 && nums[1] !== 0) {
      ratio = nums[0] / nums[1];
    }
  }

  return calculateSizesByRatio(ratio);
}

export function getProductTypeById(id: string): ProductTypeOption {
  return PRODUCT_TYPES.find((type) => type.id === id) || PRODUCT_TYPES[0];
}

export function calculateUnitPrice(productTypeId: string, sizeMultiplier: number): number {
  const productType = getProductTypeById(productTypeId);
  return Math.round(productType.basePrice * (sizeMultiplier || 1));
}
