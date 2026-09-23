// JPEG 블록 아티팩트(각짐)를 재는 자.
//
// ⚠️ 지금까지 쓴 지표(디테일 총량·잡음·색잡티·픽셀당 바이트)는 전부 "화면에
//    정보가 얼마나 있나"를 쟀다. 그래서 단색 색면 회화와 뭉개진 복제본이
//    같은 값으로 나왔다 — 미술에서 정보가 적은 건 훼손일 수도, 작가의 선택일
//    수도 있기 때문이다.
//
// 각짐은 양이 아니라 **주기**다. 강하게 압축된 JPEG 은 8픽셀 격자에서만
// 불연속이 생긴다. 그 격자 위 차이와 격자 밖 차이의 비를 보면, 원본이 단색이든
// 복잡하든 상관없이 "압축으로 망가졌나"만 뽑아낼 수 있다.
//
//   blockiness = mean|Δ| (x ≡ 7 mod 8) / mean|Δ| (그 외)
//   1.0 = 격자가 안 보임(정상), 1.3 이상이면 눈에 띈다.
//
// ⚠️ 리사이즈하면 안 된다. 격자 위치가 흐트러져 값이 1로 수렴한다.
import sharp from 'sharp';

export async function blockiness(buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: false })
    .grayscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w < 24 || h < 24) return null;

  let onSum = 0, onCnt = 0, offSum = 0, offCnt = 0;
  // 가로 방향
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const d = Math.abs(data[row + x] - data[row + x + 1]);
      if (x % 8 === 7) { onSum += d; onCnt++; } else { offSum += d; offCnt++; }
    }
  }
  // 세로 방향도 같이 본다 — 한쪽만 보면 가로줄 많은 그림에서 값이 튄다
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h - 1; y++) {
      const d = Math.abs(data[y * w + x] - data[(y + 1) * w + x]);
      if (y % 8 === 7) { onSum += d; onCnt++; } else { offSum += d; offCnt++; }
    }
  }
  const on = onCnt ? onSum / onCnt : 0;
  const off = offCnt ? offSum / offCnt : 0;
  return off > 0.2 ? on / off : null;
}
