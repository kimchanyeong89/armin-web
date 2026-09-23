// 스캔 잡티(필름 그레인)를 재는 자.
//
// ⚠️ 해상도로도 압축률로도 안 걸린다. 잡티가 많으면 오히려 바이트를 더 먹어서
//    픽셀당 바이트는 멀쩡해 보인다. 잡티 자체를 재야 한다.
//
// 방법: **아주 작은 흐림에 사라지는 성분의 비중**을 본다.
//   grain = mean|I − blur(I, 0.8)|   … 픽셀 단위로만 튀는 성분(잡티 + 아주 가는 선)
//   form  = mean|I − blur(I, 3.0)|   … 형태가 만드는 성분(윤곽·붓질·색면 경계)
//   비율 grain/form 이 높을수록 "형태는 없고 잡티만 많은" 이미지다.
//   선명한 그림은 두 값이 같이 커져서 비율이 안 올라가고,
//   그레인이 낀 사진은 분자만 커진다.
import sharp from 'sharp';

export async function grainRatio(buf) {
  const base = sharp(buf, { limitInputPixels: false })
    .grayscale()
    // kernel:'nearest' — 보간 축소는 그 자체로 잡티를 뭉개서 거친 원본과
    // 깨끗한 원본을 같은 값으로 만든다.
    .resize(720, 720, { fit: 'inside', withoutEnlargement: true, kernel: 'nearest' });

  const [raw, soft, wide] = await Promise.all([
    base.clone().raw().toBuffer({ resolveWithObject: true }),
    base.clone().blur(0.8).raw().toBuffer(),
    base.clone().blur(3.0).raw().toBuffer(),
  ]);

  const { data, info } = raw;
  const n = info.width * info.height;
  if (n < 25) return null;

  let grain = 0, form = 0;
  for (let i = 0; i < n; i++) {
    grain += Math.abs(data[i] - soft[i]);
    form += Math.abs(data[i] - wide[i]);
  }
  grain /= n; form /= n;
  return { grain, form, ratio: form > 0.5 ? grain / form : 0 };
}
