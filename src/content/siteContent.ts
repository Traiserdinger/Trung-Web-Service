// Nội dung chữ của trang. Trung sửa ở đây, không cần đụng code giao diện.

const GH = 'https://github.com/Traiserdinger'
const RAW = 'https://raw.githubusercontent.com/Traiserdinger'

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
      'Bo FMU chạy PX4 dựa trên STM32H743, vẽ trên Altium Designer từ schematic tới layout, xuất BOM và kèm vỏ in 3D cho khung F450.',
    facts: ['STM32H743', 'Altium Designer', 'Schematic, PCB, BOM', 'Vỏ in 3D'],
    tag: 'Mạch và vỏ',
    repoUrl: `${GH}/Custom-PX4-Flight-Controller`,
    images: [
      {
        src: `${RAW}/Custom-PX4-Flight-Controller/main/Docs/images/pcb_3d_top.png`,
        alt: 'Ảnh render 3D mặt trên mạch điều khiển bay PX4',
        caption: 'Bản render từ Altium',
      },
      {
        src: `${RAW}/Custom-PX4-Flight-Controller/main/Docs/images/pcb_top.jpg`,
        alt: 'Ảnh chụp mạch PX4 thật sau khi gia công và hàn',
        caption: 'Mạch thật sau khi hàn',
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
