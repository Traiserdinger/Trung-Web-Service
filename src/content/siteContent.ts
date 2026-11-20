// Nội dung chữ của trang. Trung sửa ở đây, không cần đụng code giao diện.

const GH = 'https://github.com/Traiserdinger'
const RAW = 'https://raw.githubusercontent.com/Traiserdinger'
/** Ảnh và mô hình 3D của mạch PX4, tạo bằng scripts/assets từ repo gốc */
const PX4 = '/projects/px4'

export const hero = {
  title: 'Mạch vừa vỏ, ngay từ bản vẽ đầu tiên.',
  lead:
    'Mình thiết kế PCB, viết firmware và in 3D vỏ hộp trên cùng một file 3D. Cổng USB không cấn vách, lỗ ốc trùng chân đế, khe tản nhiệt nằm đúng chỗ nóng.',
  primaryCta: 'Báo giá in 3D',
  secondaryCta: 'Xem dự án',
}

/** Bảng thông số kiểu datasheet dưới hero */
export const specs: { label: string; value: string }[] = [
  { label: 'Thiết kế mạch', value: 'Altium hoặc Allegro, 2–6 lớp' },
  { label: 'Gia công PCB', value: '2–8 lớp, có hàng sau 8–9 ngày' },
  { label: 'Firmware', value: 'STM32, ESP32, Arduino' },
  { label: 'In 3D', value: 'Bambu Lab A1 Mini, khổ 180 mm' },
]

/** Chú thích gắn trên mô hình 3D ở hero */
export const heroCallouts = {
  port: 'Cổng USB-C căn tâm khe, hở 0,3 mm',
  vent: 'Khe tản nhiệt nằm trên MCU',
  standoff: 'Chân đế M2.5 trùng lỗ mạch',
}

export interface Project {
  id: string
  title: string
  summary: string
  facts: string[]
  tag: string
  repoUrl: string
  images: { src: string; alt: string; caption: string }[]
}

export const projects: Project[] = [
  {
    id: 'px4',
    title: 'Mạch điều khiển bay PX4 tự thiết kế',
    summary:
      'Bo FMU chạy PX4 dựa trên STM32H743. Bản A vẽ trên Altium, đã gia công và chạy thử. Bản B làm lại trên OrCAD và Allegro: nhỏ hơn, 6 lớp, nguồn lấy thẳng từ pin.',
    facts: ['STM32H743', 'Altium và Allegro', 'Schematic, PCB, BOM', 'Vỏ in 3D'],
    tag: 'Mạch và vỏ',
    repoUrl: `${GH}/Custom-PX4-Flight-Controller`,
    images: [
      {
        src: `${PX4}/revb-iso-top.webp`,
        alt: 'Ảnh render 3D mạch điều khiển bay PX4 bản B',
        caption: 'Bản B, render từ file STEP',
      },
    ],
  },
  {
    id: 'cubli',
    title: 'Khối lập phương tự cân bằng Cubli',
    summary:
      'ESP32 điều khiển 3 động cơ Nidec 24H bằng bộ điều khiển LQR, đứng thăng bằng trên cạnh và trên đỉnh, tự dò tham số và chỉnh qua BLE.',
    facts: ['ESP32', 'PCB Altium riêng', 'LQR', 'BLE tuning'],
    tag: 'Mạch và firmware',
    repoUrl: `${GH}/Cubli-Version-2`,
    images: [
      {
        src: `${RAW}/Cubli-Version-2/main/docs/images/pcb_top.png`,
        alt: 'Ảnh render 3D mạch điều khiển Cubli với các cổng động cơ',
        caption: 'Bo điều khiển Cubli',
      },
    ],
  },
  {
    id: 'espfc',
    title: 'Firmware bay cho quadcopter F450',
    summary:
      'Viết từ đầu bằng C/C++ cho ESP32-S3, không dùng Betaflight hay ArduPilot: PID, hợp nhất cảm biến IMU, áp suất, GPS, optical flow và nhận tay điều khiển i-Bus.',
    facts: ['ESP32-S3', 'PID tự viết', 'Sensor fusion', 'i-Bus'],
    tag: 'Firmware',
    repoUrl: `${GH}/ESP-FC-F450-Quadcopter`,
    images: [],
  },
]

/** Loại lớp đồng — quyết định màu khi xem từng lớp */
export type LayerKind = 'signal' | 'ground' | 'power'

export interface BoardLayer {
  id: string
  /** Tên ngắn trên sơ đồ mặt cắt */
  name: string
  /** Lớp này dùng để làm gì */
  role: string
  kind: LayerKind
  src: string
}

export interface BoardRevision {
  id: 'a' | 'b'
  label: string
  version: string
  tool: string
  status: string
  /** Đã có mạch thật hay mới trên bản vẽ */
  built: boolean
  size: string
  stackup: string
  highlights: string[]
  render: { src: string; alt: string }
  /** Ảnh nhỏ đặt chồng góc ảnh render: ảnh chụp mạch thật, hoặc mặt dưới */
  inset?: { src: string; alt: string; caption: string; fit: 'cover' | 'contain' }
  /** Bo góc của bo mạch, theo % cạnh — để vẽ khung khi xem từng lớp */
  cornerRadius: string
  model: { src: string; sizeLabel: string; note?: string }
  layers: BoardLayer[]
}

/** Case study PX4: hai bản mạch, mỗi bản có ảnh render, từng lớp đồng và mô hình 3D từ file STEP */
export const px4Revisions: BoardRevision[] = [
  {
    id: 'a',
    label: 'Bản A',
    version: 'V1.0',
    tool: 'Altium Designer',
    status: 'Đã gia công, hàn và chạy thử',
    built: true,
    size: '69,5 × 68,7 mm',
    stackup: '4 lớp',
    highlights: [
      'Hai IMU ICM-42688-P và ICM-42670-P, hai cảm biến áp suất BMP390L và BMP581',
      '4 cổng motor và 4 cổng AUX qua buffer SN74LVC244',
      'Nguồn 5 V cấp từ ngoài, đo dòng bằng INA219',
    ],
    render: { src: `${PX4}/reva-render-top.webp`, alt: 'Ảnh render 3D mặt trên mạch PX4 bản A từ Altium' },
    inset: {
      src: `${PX4}/reva-photo-top.webp`,
      alt: 'Ảnh chụp mạch PX4 bản A sau khi gia công và hàn',
      caption: 'Mạch thật sau khi hàn',
      fit: 'cover',
    },
    cornerRadius: '10%',
    model: { src: `${PX4}/fmu-rev-a.glb`, sizeLabel: '0,4 MB' },
    layers: [
      { id: 'l1', name: 'Top', role: 'Linh kiện và đường tín hiệu', kind: 'signal', src: `${PX4}/reva-l1-top.webp` },
      { id: 'l2', name: 'Lớp trong 1', role: 'Mặt đồng liền, chỉ khoét chỗ via đi qua', kind: 'ground', src: `${PX4}/reva-l2-inner1.webp` },
      { id: 'l3', name: 'Lớp trong 2', role: 'Mặt đồng liền thứ hai', kind: 'ground', src: `${PX4}/reva-l3-inner2.webp` },
      { id: 'l4', name: 'Bottom', role: 'Linh kiện mặt dưới và đường tín hiệu', kind: 'signal', src: `${PX4}/reva-l4-bottom.webp` },
    ],
  },
  {
    id: 'b',
    label: 'Bản B',
    version: 'V1.1',
    tool: 'OrCAD Capture và Allegro 24.1',
    status: 'Xong layout, đang review, chưa gia công',
    built: false,
    size: '40,5 × 40,5 mm',
    stackup: '6 lớp, dày 1,6 mm',
    highlights: [
      'Nhỏ hơn gần một nửa, 4 lỗ M3 cách nhau 32,6 mm',
      'Buck TPS5430 lấy nguồn thẳng từ pin 3S–6S',
      '8 cổng motor nối thẳng MCU, chạy được DShot hai chiều',
      'Thêm la bàn HMC5883L, mỗi IMU một bus SPI riêng',
      'Linh kiện thụ động 0402, 151 linh kiện trên hai mặt',
    ],
    render: { src: `${PX4}/revb-iso-top.webp`, alt: 'Ảnh render 3D mạch PX4 bản B nhìn chéo từ trên' },
    inset: {
      src: `${PX4}/revb-iso-bottom.webp`,
      alt: 'Ảnh render mặt dưới mạch PX4 bản B với cổng motor và thẻ nhớ',
      caption: 'Mặt dưới, 93 linh kiện',
      fit: 'contain',
    },
    cornerRadius: '7.5%',
    model: { src: `${PX4}/fmu-rev-b.glb`, sizeLabel: '2 MB', note: 'Tụ 0402 hiện dạng khối hộp vì chưa gán mô hình 3D' },
    layers: [
      { id: 'l1', name: 'Top', role: 'Linh kiện và đường tín hiệu', kind: 'signal', src: `${PX4}/revb-l1-top.webp` },
      { id: 'l2', name: 'GND', role: 'Mặt đất liền cho lớp Top', kind: 'ground', src: `${PX4}/revb-l2-gnd.webp` },
      { id: 'l3', name: 'Signal', role: 'Đường tín hiệu bên trong', kind: 'signal', src: `${PX4}/revb-l3-signal.webp` },
      { id: 'l4', name: 'Power', role: '+5 V, +3,3 V cho MCU và +3,3 V cho cảm biến', kind: 'power', src: `${PX4}/revb-l4-power.webp` },
      { id: 'l5', name: 'GND', role: 'Mặt đất liền cho lớp Bottom', kind: 'ground', src: `${PX4}/revb-l5-gnd.webp` },
      { id: 'l6', name: 'Bottom', role: 'Linh kiện mặt dưới và đường tín hiệu', kind: 'signal', src: `${PX4}/revb-l6-bottom.webp` },
    ],
  },
]

export interface ServiceTier {
  name: string
  adds: string
  price: string
  recommended?: boolean
  combo?: boolean
}

/** Mỗi gói gồm toàn bộ gói trước */
export const serviceTiers: ServiceTier[] = [
  {
    name: 'Bản vẽ',
    adds: 'Schematic, layout PCB, Gerber, BOM và file Pick & Place. Kèm 1 vòng chỉnh sửa.',
    price: 'Báo giá theo yêu cầu',
  },
  {
    name: 'Mạch trần',
    adds: 'Đặt gia công 2–8 lớp giúp bạn, có hàng sau 8–9 ngày.',
    price: 'Gia công từ 183.000đ cho mạch 2 lớp ≤ 10×10 cm',
  },
  {
    name: 'Mạch chạy được',
    adds: 'Hàn linh kiện và test chức năng. Linh kiện tính riêng theo file BOM.',
    price: 'Công hàn và test báo theo BOM',
    recommended: true,
  },
  {
    name: 'Trọn gói mạch và vỏ',
    adds: 'Vỏ in 3D dựng từ chính file 3D của mạch, 1 lần in thử để kiểm tra lắp ráp, giảm 10% phần vỏ.',
    price: 'Rẻ hơn đặt lẻ từng phần',
    combo: true,
  },
]

export const serviceAddOns = 'Thêm khi cần: firmware STM32 hoặc ESP32, làm gấp, thêm vòng chỉnh sửa.'

export const processSteps: { title: string; body: string }[] = [
  { title: 'Gửi file hoặc mô tả', body: 'File STL, bản vẽ có sẵn, hay chỉ là một ý tưởng kèm vài tấm ảnh đều được.' },
  { title: 'Nhận báo giá qua Zalo', body: 'Mình xem yêu cầu, hỏi lại chỗ chưa rõ và gửi giá, thời gian làm.' },
  { title: 'Duyệt bản vẽ, in thử', body: 'Bạn xem file 3D trước khi gia công. Với gói trọn gói, mình in thử vỏ để kiểm tra lắp.' },
  { title: 'Nhận hàng', body: 'Bạn nhận mạch, vỏ và toàn bộ file gốc để tự sửa hoặc đặt lại về sau.' },
]

export const contact = {
  title: 'Có bản vẽ, hay mới chỉ có ý tưởng? Nhắn mình.',
  body: 'Gửi file hoặc vài dòng mô tả qua Zalo, mình trả lời kèm câu hỏi kỹ thuật cần làm rõ và báo giá.',
}
