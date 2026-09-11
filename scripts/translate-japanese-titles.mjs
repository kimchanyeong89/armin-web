// 후쿠오카·지바 컬렉션에 남은 일본어 제목을 한국어·영어로 옮긴다.
//
// 이 두 곳은 소스가 영문 제목을 아예 안 준다(0건). 그래서 normalize-japanese-titles.mjs
// 의 "영문을 끌어올린다" 전략이 통하지 않는다. 여기서는 직접 옮긴다.
//
//   title            → 영문(로마자) — 영어 모드와 검색 색인이 쓴다
//   metadata.title_ja→ 원문 보존
//   artwork-titles   → 한국어 (public/data/i18n/artwork-titles.json, `artist\ttitle` 키)
//
// 지바는 우키요에라 제목이 「연작명 역참명 부제」 조합이고 뒤에 후리가나(읽기)가
// 통째로 붙어 온다. 조합형은 부품 사전으로 풀고, 나머지는 직접 대응표로 받는다.
//
//   node scripts/translate-japanese-titles.mjs           # dry-run
//   node scripts/translate-japanese-titles.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TITLES_KO = path.join(ROOT, 'public/data/i18n/artwork-titles.json');
const JP = /[぀-ヿ㐀-䶿一-鿿]/;
const KANA_ONLY = /^[ぁ-ゖー\s（）()、。『』「」]+$/;

/* ── 지바: 도카이도 연작 부품 ───────────────────────────────────────── */
const SERIES = {
  '東海道名所之内': ['도카이도 명소', 'Famous Places of the Tōkaidō'],
  '東海道之内': ['도카이도', 'The Tōkaidō'],
  '東海道': ['도카이도', 'The Tōkaidō'],
};
const PLACES = {
  金谷: ['가나야', 'Kanaya'], 藤枝: ['후지에다', 'Fujieda'], 島田: ['시마다', 'Shimada'],
  日坂: ['닛사카', 'Nissaka'], 掛川: ['가케가와', 'Kakegawa'], 荒井: ['아라이', 'Arai'],
  袋井: ['후쿠로이', 'Fukuroi'], 白須賀: ['시라스카', 'Shirasuka'], 双川: ['후타가와', 'Futagawa'],
  吉田: ['요시다', 'Yoshida'], 御油: ['고유', 'Goyu'], 赤坂: ['아카사카', 'Akasaka'],
  岡崎: ['오카자키', 'Okazaki'], 鳴海: ['나루미', 'Narumi'], 藤川: ['후지카와', 'Fujikawa'],
  池鯉鮒: ['지류', 'Chiryū'], 宮: ['미야', 'Miya'], 桑名: ['구와나', 'Kuwana'],
  四日市: ['욧카이치', 'Yokkaichi'], 石薬師: ['이시야쿠시', 'Ishiyakushi'],
  亀山: ['가메야마', 'Kameyama'], 庄野: ['쇼노', 'Shōno'], 関: ['세키', 'Seki'],
  坂ノ下: ['사카노시타', 'Sakanoshita'], 土山: ['쓰치야마', 'Tsuchiyama'],
  水口: ['미나쿠치', 'Minakuchi'], 石部: ['이시베', 'Ishibe'], 草津: ['구사쓰', 'Kusatsu'],
  大津: ['오쓰', 'Ōtsu'], 佐屋: ['사야', 'Saya'], 膳所: ['제제', 'Zeze'],
  宇津谷峠: ['우쓰노야 고개', 'Utsunoya Pass'], 小夜中山: ['사요노나카야마', 'Sayo no Nakayama'],
  豊川: ['도요카와', 'Toyokawa'], 天竜川: ['덴류강', 'Tenryū River'],
  比叡山: ['히에이산', 'Mt. Hiei'], 京嵐山: ['교토 아라시야마', 'Arashiyama, Kyoto'],
  瀬田唐橋: ['세타 가라하시', 'Seta Karahashi Bridge'],
  大津三井寺: ['오쓰 미이데라', 'Mii-dera Temple, Ōtsu'],
  熱田一の鳥居: ['아쓰타 첫 도리이', 'First Torii at Atsuta'],
  '宮駅 熱田社': ['미야역 아쓰타 신사', 'Miya Station, Atsuta Shrine'],
  '名古屋 津島牛頭天王': ['나고야 쓰시마 고즈텐노', 'Tsushima Gozu Tennō, Nagoya'],
  '池鯉鮒八ツ橋': ['지류 야쓰하시', 'Yatsuhashi at Chiryū'],
  '鳴海有松絞': ['나루미 아리마쓰 홀치기염', 'Arimatsu Shibori at Narumi'],
  '桶狭間 鎧かけ松': ['오케하자마 갑옷걸이 소나무', 'Armor-Hanging Pine at Okehazama'],
  '池鯉鮒有松之景': ['지류 아리마쓰 풍경', 'View of Arimatsu at Chiryū'],
  '金谷日坂之間 菊川': ['가나야·닛사카 사이 기쿠가와', 'Kikugawa between Kanaya and Nissaka'],
  '日坂 名物あめの餅': ['닛사카, 명물 아메모치', 'Nissaka: Famous Ame-mochi'],
  '双川 名物かしは餅': ['후타가와, 명물 가시와모치', 'Futagawa: Famous Kashiwa-mochi'],
  '御油 名物あまさけ': ['고유, 명물 아마자케', 'Goyu: Famous Amazake'],
  '岡崎 矢はぎ川舟わたし': ['오카자키 야하기강 나룻배', 'Yahagi River Ferry at Okazaki'],
  '土山 鈴ヶ山坂ノ下': ['쓰치야마 스즈가야마 사카노시타', 'Suzugayama and Sakanoshita at Tsuchiyama'],
  '膳所 矢橋の帰帆': ['제제, 야바세의 귀범', 'Returning Sails at Yabase, Zeze'],
  '坂ノ下 筆拾山': ['사카노시타 후데히로이산', 'Mt. Fudehiroi at Sakanoshita'],
  '桑名蜃気楼': ['구와나 신기루', 'Mirage at Kuwana'],
  '四日市追分': ['욧카이치 오이와케', 'Oiwake at Yokkaichi'],
  '吉田 其二': ['요시다, 그 둘', 'Yoshida, No. 2'],
  '（白鳥神社）': ['시라토리 신사', 'Shiratori Shrine'],
  '京都参内': ['교토 참내', 'Court Visit in Kyoto'],
};

/* ── 지바: 그 밖의 제목 직접 대응 ───────────────────────────────────── */
const CHIBA_DIRECT = {
  '八代目市川団十郎死絵悪摺': ['8대 이치카와 단주로 추모화(악쇄본)', 'Memorial Print for Ichikawa Danjūrō VIII (Poor Impression)'],
  '八代目市川団十郎の死絵': ['8대 이치카와 단주로 추모화', 'Memorial Print for Ichikawa Danjūrō VIII'],
  '坂東しうかの死絵': ['반도 슈카 추모화', 'Memorial Print for Bandō Shūka'],
  '初代坂東しうかの死絵': ['초대 반도 슈카 추모화', 'Memorial Print for Bandō Shūka I'],
  '三代目市川市蔵の死絵': ['3대 이치카와 이치조 추모화', 'Memorial Print for Ichikawa Ichizō III'],
  '初代岩井杜若の死絵': ['초대 이와이 아야메 추모화', 'Memorial Print for Iwai Ayame I'],
  '八代目市川団十郎と坂東しうか死絵': ['8대 이치카와 단주로와 반도 슈카 추모화', 'Memorial Print for Ichikawa Danjūrō VIII and Bandō Shūka'],
  '五代目市川海老蔵の死絵': ['5대 이치카와 에비조 추모화', 'Memorial Print for Ichikawa Ebizō V'],
  '四代目尾上菊五郎の死絵': ['4대 오노에 기쿠고로 추모화', 'Memorial Print for Onoe Kikugorō IV'],
  '四代目尾上菊五郎と女房お蝶の死絵': ['4대 오노에 기쿠고로와 아내 오초 추모화', 'Memorial Print for Onoe Kikugorō IV and His Wife Ochō'],
  '八代目片岡仁左衛門の死絵': ['8대 가타오카 니자에몬 추모화', 'Memorial Print for Kataoka Nizaemon VIII'],
  '初代河原崎国太郎の死絵': ['초대 가와라자키 구니타로 추모화', 'Memorial Print for Kawarazaki Kunitarō I'],
  '初代市川女寅の死絵': ['초대 이치카와 메토라 추모화', 'Memorial Print for Ichikawa Metora I'],
  '役者図': ['배우 그림', 'Portrait of an Actor'],
  '美人図': ['미인도', 'Portrait of a Beauty'],
  '武者図': ['무사도', 'Portrait of a Warrior'],
  '見立鹿島踊': ['미타테 가시마오도리', 'Mitate of the Kashima Dance'],
  '『阪神名勝図絵』': ['한신 명승도회', 'Illustrated Famous Views of Hanshin'],
  '『横濱八景詩画』': ['요코하마 팔경 시화', 'Poems and Pictures of Eight Views of Yokohama'],
  '『虫類画譜』': ['충류화보', 'Album of Insects'],
  '『千種之花』三編': ['치구사노하나 제3편', 'Chigusa no Hana, Part Three'],
  '『写生草花模様』下': ['사생 초화 문양 하권', 'Sketches of Flower Patterns, Vol. 2'],
  '『詩と版画』8輯': ['시와 판화 제8집', 'Poetry and Prints, No. 8'],
  '曾我五郎（八代目市川団十郎の死絵）': ['소가 고로(8대 이치카와 단주로 추모화)', 'Soga Gorō (Memorial Print for Ichikawa Danjūrō VIII)'],
  '八代目市川団十郎の死絵 (乍憚口上)': ['8대 이치카와 단주로 추모화(황공하오나 아뢰옵기를)', 'Memorial Print for Ichikawa Danjūrō VIII (Humble Address)'],
  '心のうち(八代目市川団十郎死絵悪摺)': ['마음속(8대 이치카와 단주로 추모화, 악쇄본)', 'In the Heart (Memorial Print for Ichikawa Danjūrō VIII, Poor Impression)'],
  '高野山麓 鏡石の図（八代目市川団十郎死絵悪摺）': ['고야산 기슭 거울바위 그림(8대 이치카와 단주로 추모화, 악쇄본)', 'Mirror Rock at the Foot of Mt. Kōya (Memorial Print for Ichikawa Danjūrō VIII, Poor Impression)'],
  'むかしばなし さるかにがっせん （八代目市川団十郎死絵悪摺）': ['옛이야기 원숭이와 게의 싸움(8대 이치카와 단주로 추모화, 악쇄본)', 'Old Tale: The Monkey and the Crab (Memorial Print for Ichikawa Danjūrō VIII, Poor Impression)'],
  '坂東しうかの死絵（右上円窓内に八代目市川団十郎）': ['반도 슈카 추모화(오른쪽 위 원창에 8대 이치카와 단주로)', 'Memorial Print for Bandō Shūka (Ichikawa Danjūrō VIII in the Upper Right Roundel)'],
  '夫婦合体 欲の獣－名おタメごかし（八代目市川団十郎死絵悪摺）': ['부부합체 욕망의 짐승 — 이름뿐인 위선(8대 이치카와 단주로 추모화, 악쇄본)', 'Husband and Wife United, Beast of Greed (Memorial Print for Ichikawa Danjūrō VIII, Poor Impression)'],
  '曾我兄弟（市川猿蔵の死絵）': ['소가 형제(이치카와 엔조 추모화)', 'The Soga Brothers (Memorial Print for Ichikawa Enzō)'],
  '白井権八と女長兵衛（八代目市川団十郎と坂東しうかの死絵）': ['시라이 곤파치와 온나 초베(8대 이치카와 단주로와 반도 슈카 추모화)', 'Shirai Gonpachi and Onna Chōbei (Memorial Print for Ichikawa Danjūrō VIII and Bandō Shūka)'],
  '四代目尾上菊五郎死絵（坐像）': ['4대 오노에 기쿠고로 추모화(좌상)', 'Memorial Print for Onoe Kikugorō IV (Seated Figure)'],
  '四代目尾上菊五郎の死絵（老赤鬼を従える）': ['4대 오노에 기쿠고로 추모화(늙은 붉은 도깨비를 거느리다)', 'Memorial Print for Onoe Kikugorō IV (with an Old Red Demon)'],
  '『詩と版画』8輯 しとはんが8しゅう': ['시와 판화 제8집', 'Poetry and Prints, No. 8'],
  '曽我の対面（三代目坂東三津五郎の工藤、瀬川路考の虎、五代目岩井半四郎の少将）': ['소가의 대면(3대 반도 미쓰고로의 구도, 세가와 로코의 도라, 5대 이와이 한시로의 쇼쇼)', "The Soga Brothers' Encounter (Bandō Mitsugorō III as Kudō, Segawa Rokō as Tora, Iwai Hanshirō V as Shōshō)"],
  'がう商の花嫁 色なほしの図': ['호상의 신부, 옷 갈아입기 그림', "The Merchant's Bride: Changing Robes"],
  '役者図（画中短冊形）': ['배우 그림(화중 단책형)', 'Portrait of an Actor (Tanzaku Format within the Picture)'],
  '『古今画薮 後八種』/『古今画薮 後八種 四体譜』': ['고금화수 후팔종 / 고금화수 후팔종 사체보', 'Kokon Gasō, Latter Eight Types / Kokon Gasō, Latter Eight Types: Four Scripts'],
  'めぐみのつゆ（エスキース） めぐみのつゆ（えすきーす） Dew of Beneficence（Esquisse）': ['은혜의 이슬(에스키스)', 'Dew of Beneficence (Esquisse)'],
  '三井寺鐘の音（二種） みいでらかねのね（にしゅ） Ring in the Mii-Dera Temple（Two types）': ['미이데라 종소리(2종)', 'Ring in the Mii-dera Temple (Two Types)'],
  '『四方海』': ['사방의 바다', 'Yomo no Umi (Seas of All Quarters)'],
  '『蝶千種』（『蝶千種 一』『蝶千種 一・二』）': ['나비 천 가지', 'Chō Senshu (A Thousand Butterflies)'],
  '『米利幹新誌』': ['아메리카 신지', 'Meriken Shinshi (New Account of America)'],
  '『大原木の始』': ['오하라기의 시작', 'Oharagi no Hajime'],
  '『新頌 富士』': ['신송 후지', 'Shinshō Fuji (New Ode to Mt. Fuji)'],
  '『通俗伊蘇普物語』': ['통속 이솝 이야기', 'Popular Tales of Aesop'],
  '春景山水図': ['춘경산수도', 'Spring Landscape'],
  '月夜水辺図': ['월야수변도', 'Waterside on a Moonlit Night'],
  '源頼義像': ['미나모토노 요리요시 초상', 'Portrait of Minamoto no Yoriyoshi'],
  '鶏図': ['닭 그림', 'Rooster'],
  '（鯰） （なまず） （Catfish）': ['메기', 'Catfish'],
  '墨竹図 （川村幾三旧蔵資料のうち）': ['묵죽도(가와무라 이쿠조 구장 자료 중)', 'Ink Bamboo (from the Kawamura Ikuzō Collection)'],
};

/* ── 후쿠오카: 대부분 인도 신상 이름의 가타카나 표기 ─────────────────── */
const FAAM_DIRECT = {
  クリシュナ: ['크리슈나', 'Krishna'],
  'クリシュナとラーダ―': ['크리슈나와 라다', 'Krishna and Radha'],
  'クリシュナとラーダー': ['크리슈나와 라다', 'Krishna and Radha'],
  ヒンドゥスタンの民の典型: ['힌두스탄 사람들의 전형', 'Types of the People of Hindustan'],
  インドの民俗風習: ['인도의 민속 풍습', 'Folk Customs of India'],
  マハーバーラタ: ['마하바라타', 'Mahabharata'],
  ラクシュミー: ['락슈미', 'Lakshmi'],
  ガネーシャ: ['가네샤', 'Ganesha'],
  'ガネーシャ（版下）': ['가네샤(원도)', 'Ganesha (Print Design)'],
  ガネーシャ九態: ['가네샤 아홉 모습', 'Nine Forms of Ganesha'],
  ムルガン: ['무루간', 'Murugan'],
  シタールを奏でる女性: ['시타르를 켜는 여인', 'Woman Playing the Sitar'],
  聖者: ['성자', 'A Saint'],
  お菓子を食べるクリシュナ: ['과자를 먹는 크리슈나', 'Krishna Eating Sweets'],
  ヴェーンカテーシュヴァラ: ['벤카테스와라', 'Venkateshwara'],
  ラクシュミーとタントラ図像: ['락슈미와 탄트라 도상', 'Lakshmi with Tantric Imagery'],
  ヴィシュヌ: ['비슈누', 'Vishnu'],
  ハヌマーン: ['하누만', 'Hanuman'],
  シヴァ: ['시바', 'Shiva'],
  シヴァとヤントラ: ['시바와 얀트라', 'Shiva with Yantra'],
  'シヴァ・リンガ': ['시바 링가', 'Shiva Linga'],
  バラを持つ女性: ['장미를 든 여인', 'Woman Holding a Rose'],
  龍の頭の上で踊るクリシュナ: ['용의 머리 위에서 춤추는 크리슈나', 'Krishna Dancing on the Serpent'],
  ダッタートレーヤ: ['닷타트레야', 'Dattatreya'],
  ライオンと地球に乗る女性: ['사자와 지구 위의 여인', 'Woman on a Lion and the Globe'],
  美の女王: ['미의 여왕', 'Queen of Beauty'],
  駕籠にのる男性: ['가마에 탄 남자', 'Man in a Palanquin'],
  蝶と薔薇: ['나비와 장미', 'Butterfly and Roses'],
  ヒンドゥー建築のモニュメント: ['힌두 건축의 기념물', 'Monuments of Hindu Architecture'],
  'ラージャー・スタンボエル': ['라자 스탐불', 'Raja Stamboel'],
  アリババ: ['알리바바', 'Ali Baba'],
  森へ追放されるラーマ: ['숲으로 추방되는 라마', 'Rama Banished to the Forest'],
  '男性像（タミル・ナードゥ州）': ['남자상(타밀나두주)', 'Figure of a Man (Tamil Nadu)'],
  シヴァに食物を施すアンナプールナー: ['시바에게 음식을 베푸는 안나푸르나', 'Annapurna Offering Food to Shiva'],
  ミーナークシー: ['미낙시', 'Meenakshi'],
  'アナンダ・バイラバ': ['아난다 바이라바', 'Ananda Bhairava'],
  アルナーチャレーシュワラ寺院と本尊: ['아루나찰레스와라 사원과 본존', 'Arunachaleswara Temple and Its Deity'],
  'クルパンナ・サミ': ['쿠루판나 사미', 'Kurupanna Sami'],
  カルマリアンマン: ['카루마리암만', 'Karumariamman'],
  クベーラとラクシュミー: ['쿠베라와 락슈미', 'Kubera and Lakshmi'],
  ヴィシュヌと神々: ['비슈누와 신들', 'Vishnu and the Gods'],
  バターを食べてヤショーダーを怒らせたクリシュナ: ['버터를 먹어 야쇼다를 화나게 한 크리슈나', 'Krishna Angering Yashoda by Eating Butter'],
  'ラーマ、シヴァ、クリシュナ': ['라마, 시바, 크리슈나', 'Rama, Shiva and Krishna'],
  スブラマニヤ: ['수브라마니아', 'Subramanya'],
  'ヴィーラ・パーンディヤ・カッタボンマン（タミールの勇者）': ['비라 판디야 카타보만(타밀의 용사)', 'Veera Pandiya Kattabomman (Tamil Hero)'],
  聖女アーンダール: ['성녀 안달', 'Saint Andal'],
  'ティルパン・アルバー': ['티루판 알바르', 'Thiruppaan Alvar'],
  ドゥルガー: ['두르가', 'Durga'],
  クリシュナにミルクを飲ませるヤショーダー: ['크리슈나에게 젖을 먹이는 야쇼다', 'Yashoda Nursing Krishna'],
  'ナートドワーラー（シュリーナート寺院のクリシュナ）': ['나트드와라(슈리나트 사원의 크리슈나)', 'Nathdwara (Krishna of Shrinathji Temple)'],
  ヒンドゥーの女神たちと寺院: ['힌두 여신들과 사원', 'Hindu Goddesses and Temple'],
  ラクシュミーとチャクラ図: ['락슈미와 차크라 도상', 'Lakshmi with Chakra Diagram'],
  サラスヴァティー: ['사라스바티', 'Saraswati'],
  'ミーナークシー、アンナンマ、ラクシュミー': ['미낙시, 안남마, 락슈미', 'Meenakshi, Annamma and Lakshmi'],
  ナラシンハ: ['나라심하', 'Narasimha'],
  ラーメーシュワラム: ['라메스와람', 'Rameswaram'],
  シラパティカラムの話: ['실라파디카람 이야기', 'The Tale of Silappadikaram'],
  ブラークと聖者たち: ['부라크와 성자들', 'Buraq and the Saints'],
  カアバ神殿とガネーシャとキリスト: ['카바 신전과 가네샤와 그리스도', 'The Kaaba, Ganesha and Christ'],
  カイラーサ山を運ぶハヌマーン: ['카일라사산을 옮기는 하누만', 'Hanuman Carrying Mount Kailasa'],
  クリシュナの生い立ち: ['크리슈나의 성장', 'The Childhood of Krishna'],
  'クダルマーニキャスワーニー（バラタ）': ['쿠달마니키야스와미(바라타)', 'Kudalmanikyaswami (Bharata)'],
  'トリプラヤーラッパン（ラーマ）': ['트리프라야랏판(라마)', 'Triprayarappan (Rama)'],
  'グルヴァーユーラッパン（クリシュナ）': ['구루바유랏판(크리슈나)', 'Guruvayurappan (Krishna)'],
  'コードゥンガッルール・バガヴァティー（カーリー）': ['코둔갈루르 바가바티(칼리)', 'Kodungallur Bhagavathy (Kali)'],
  'チョーターニッカラー・バガヴァティーとナーラーヤナ': ['초타니카라 바가바티와 나라야나', 'Chottanikkara Bhagavathy and Narayana'],
  女神: ['여신', 'The Goddess'],
  ヴィトーバー寺院のヴィッタルとルクミニ: ['비토바 사원의 비탈과 루크미니', 'Vithal and Rukmini of Vithoba Temple'],
  聖女アーンダールとランガマンナール: ['성녀 안달과 랑가만나르', 'Saint Andal and Rangamannar'],
  ティヤーガラージャ寺院のカマランビガイ: ['티야가라자 사원의 카말람비가이', 'Kamalambigai of Thyagaraja Temple'],
  ティヤーガラージャ寺院の本尊: ['티야가라자 사원의 본존', 'The Deity of Thyagaraja Temple'],
  'ラカイー・アンマン寺院の幸運の女神': ['라카이 암만 사원의 행운의 여신', 'Goddess of Fortune, Lakai Amman Temple'],
  豊穣のラクシュミー: ['풍요의 락슈미', 'Lakshmi of Abundance'],
  孔雀に乗るバラナシ: ['공작을 탄 바라나시', 'Varanasi Riding a Peacock'],
  薔薇を戴くメッカとメディナ: ['장미를 인 메카와 메디나', 'Mecca and Medina Crowned with Roses'],
  チャールダーム聖地巡礼: ['차르담 성지 순례', 'Char Dham Pilgrimage'],
  ドゥルガー女神に勝利あれ: ['두르가 여신께 승리를', 'Victory to Goddess Durga'],
  'カイラ・デーヴィー寺院': ['카일라 데비 사원', 'Kaila Devi Temple'],
  'マヒシャースラを倒すドゥルガー（マヒシャースラマルディニー）': ['마히샤수라를 물리치는 두르가(마히샤수라마르디니)', 'Durga Slaying Mahishasura (Mahishasuramardini)'],
  ラーマに勝利あれ: ['라마에게 승리를', 'Victory to Rama'],
  シヴァ信仰の修行者: ['시바 신앙의 수행자', 'A Shaivite Ascetic'],
  ジャガンナート寺院: ['자간나트 사원', 'Jagannath Temple'],
  'ジャガンナート、バララーマ、スバドラー': ['자간나트, 발라라마, 수바드라', 'Jagannath, Balarama and Subhadra'],
  カーリー: ['칼리', 'Kali'],
  ジヴァティの物語: ['지바티 이야기', 'The Tale of Jivati'],
  シャクンタラー: ['샤쿤탈라', 'Shakuntala'],
  'ガジャ・ラクシュミー': ['가자 락슈미', 'Gaja Lakshmi'],
  ヒンディー文字: ['힌디 문자', 'Hindi Script'],
  インド地図: ['인도 지도', 'Map of India'],
  女性と薬: ['여인과 약', 'Woman with Medicine'],
  女性とバラと香水: ['여인과 장미와 향수', 'Woman with Roses and Perfume'],
  月に腰掛けるクリシュナとラーダー: ['달에 걸터앉은 크리슈나와 라다', 'Krishna and Radha Seated on the Moon'],
  窓辺で鳥とたわむれる女性: ['창가에서 새와 노는 여인', 'Woman Playing with a Bird at the Window'],
  太陽: ['태양', 'The Sun'],
  花と女性: ['꽃과 여인', 'Flowers and a Woman'],
  'エジソン・ティー': ['에디슨 티', 'Edison Tea'],
  シェーシャに座るクリシュナ: ['셰샤 위에 앉은 크리슈나', 'Krishna Seated on Shesha'],
  インド国旗を持つドゥルガー: ['인도 국기를 든 두르가', 'Durga Holding the Indian Flag'],
  祈る女性: ['기도하는 여인', 'Woman Praying'],
  頭につぼをのせた女性: ['머리에 항아리를 인 여인', 'Woman Carrying a Pot on Her Head'],
  女性像: ['여인상', 'Figure of a Woman'],
  電話: ['전화', 'The Telephone'],
  はさみ: ['가위', 'Scissors'],
  地球に乗るライオン: ['지구 위의 사자', 'Lion on the Globe'],
  象と街並み: ['코끼리와 거리', 'Elephant and Townscape'],
  時計と松: ['시계와 소나무', 'Clock and Pine'],
  つぼに片足をかける女性: ['항아리에 한 발을 올린 여인', 'Woman Resting a Foot on a Pot'],
  白布を持つ女神: ['흰 천을 든 여신', 'Goddess Holding White Cloth'],
  ランカ島と女性: ['랑카섬과 여인', 'Lanka and a Woman'],
  インド女性: ['인도 여인', 'Indian Woman'],
  黄金のつぼ: ['황금 항아리', 'The Golden Pot'],
  木箱と鷲の紋章: ['나무 상자와 독수리 문장', 'Wooden Box with Eagle Crest'],
  インド国民会議派の旗と富士山: ['인도 국민회의파 깃발과 후지산', 'Indian National Congress Flag and Mt. Fuji'],
  赤いサリーの女性: ['붉은 사리를 입은 여인', 'Woman in a Red Sari'],
  マハラジャビールのラベル: ['마하라자 맥주 라벨', 'Maharaja Beer Label'],
  ナンディンにまたがるシヴァ: ['난디를 탄 시바', 'Shiva Riding Nandi'],
  馬にまたがる兵士: ['말을 탄 병사', 'Soldier on Horseback'],
  地球と女性: ['지구와 여인', 'The Globe and a Woman'],
  ライオンを従える女性: ['사자를 거느린 여인', 'Woman with a Lion'],
  '幼児クリシュナ': ['유아 크리슈나', 'The Infant Krishna'],
  'クリシュナの戯れ': ['크리슈나의 유희', 'The Play of Krishna'],
  'ヒンドゥー建築のモニュメント:1 .コンダナのヒンドゥー寺院、チャイティヤ': ['힌두 건축의 기념물 1. 콘다네의 힌두 사원, 차이티야', 'Monuments of Hindu Architecture 1: Hindu Temple and Chaitya at Kondane'],
  'ヒンドゥー建築のモニュメント:2.マハーバリプラムの5つのドラヴィダ建築寺院': ['힌두 건축의 기념물 2. 마하발리푸람의 다섯 드라비다 양식 사원', 'Monuments of Hindu Architecture 2: The Five Dravidian Temples of Mahabalipuram'],
  'ヒンドゥー建築のモニュメント:\n4.バダミのシヴァ寺院': ['힌두 건축의 기념물 4. 바다미의 시바 사원', 'Monuments of Hindu Architecture 4: The Shiva Temple at Badami'],
  'ヒンドゥー建築のモニュメント―5.カーンチープラムの主要寺院、カイラサナサー': ['힌두 건축의 기념물 5. 칸치푸람의 주요 사원, 카일라사나타', 'Monuments of Hindu Architecture 5: The Principal Temple of Kanchipuram, Kailasanatha'],
};

/** 「…（版下1）」「…ほか（17図版）」 같은 꼬리를 떼고 본체만 돌려준다. */
function splitTail(t) {
  // ⚠️ 「…ほか（17図版）」를 먼저 본다. 아래 일반 규칙이 먼저 걸리면 본체가
  //    「幼児クリシュナほか」가 되어 'ほか' 가 붙은 채로 사전을 못 찾는다.
  const h = t.match(/^(.*?)ほか（(\d+図版)）$/);
  if (h) return [h[1], 'ほか' + h[2]];
  const m = t.match(/^(.*?)（(版下\d*|一部[^）]*|\d+図版|[^）]*図版)）$/);
  if (m) return [m[1], m[2]];
  return [t, ''];
}
function tailText(tail) {
  if (!tail) return ['', ''];
  let m = tail.match(/^版下(\d*)$/);
  if (m) return [`원도${m[1] ? ' ' + m[1] : ''}`, `Print Design${m[1] ? ' ' + m[1] : ''}`];
  m = tail.match(/^(ほか)?(\d+)図版$/);
  if (m) return [`${m[1] ? '외 ' : ''}도판 ${m[2]}점`, `${m[1] ? 'and others, ' : ''}${m[2]} plates`];
  return [tail, tail];
}

/** 지바 제목에 통째로 붙어 오는 후리가나(읽기)를 떼어낸다. */
function stripFurigana(title) {
  const parts = String(title).split(/\s+/);
  // 뒤에서부터 가나로만 된 토막을 걷어낸다. 단 제목 전체가 가나면 그대로 둔다.
  let end = parts.length;
  while (end > 1 && KANA_ONLY.test(parts.slice(end - 1).join(' '))) end--;
  const head = parts.slice(0, end).join(' ').trim();
  return head && JP.test(head) ? head : String(title).trim();
}

function translateChiba(raw) {
  const t = stripFurigana(raw);
  if (CHIBA_DIRECT[t]) return CHIBA_DIRECT[t];
  for (const [key, series] of Object.entries(SERIES)) {
    if (!t.startsWith(key)) continue;
    const rest = t.slice(key.length).trim();
    if (!rest) return series;
    const place = PLACES[rest];
    if (place) return [`${series[0]} ${place[0]}`, `${series[1]}: ${place[1]}`];
    return null;
  }
  return null;
}

function translateFaam(raw) {
  const [body, tail] = splitTail(raw.trim());
  const hit = FAAM_DIRECT[body] || FAAM_DIRECT[raw.trim()];
  if (!hit) return null;
  if (!tail) return hit;
  const [tk, te] = tailText(tail);
  return [`${hit[0]}(${tk})`, `${hit[1]} (${te})`];
}

/* ── 적용 ──────────────────────────────────────────────────────────── */
const APPLY = process.argv.includes('--apply');
const koMap = JSON.parse(fs.readFileSync(TITLES_KO, 'utf8'));
const misses = [];
let changed = 0;

for (const [slug, translate] of [['faam-fukuoka', translateFaam], ['chiba-city-art', translateChiba]]) {
  const file = path.join(ROOT, `public/data/${slug}-collection.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = data.artworks || data.items || data;
  let n = 0;

  for (const a of list) {
    if (!JP.test(a.title || '')) continue;
    const hit = translate(a.title);
    if (!hit) { misses.push(`${slug}\t${a.title}`); continue; }
    const [ko, en] = hit;
    a.metadata = a.metadata || {};
    a.metadata.title_ja = a.title;   // 원문 보존
    a.title = en;                    // 영어 모드·검색 색인이 쓰는 값
    koMap[`${String(a.artist || '').toLowerCase()}\t${en.toLowerCase()}`] = ko;
    n++; changed++;
  }

  console.log(`${slug.padEnd(16)} 일본어 제목 → 변환 ${n}건`);
  if (APPLY) fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (APPLY) fs.writeFileSync(TITLES_KO, JSON.stringify(koMap, null, 2));
console.log(`\n합계 ${changed}건 변환 · 미매칭 ${misses.length}건`);
if (misses.length) console.log(misses.slice(0, 30).join('\n'));
console.log(APPLY ? '적용했다.' : '(dry-run — 적용하려면 --apply)');
