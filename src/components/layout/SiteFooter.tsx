import { contactConfig } from '../../config/contactConfig'

const linkCls = 'text-sky-300 hover:text-white underline-offset-4 hover:underline'

export function SiteFooter() {
  const c = contactConfig
  return (
    <footer className="mt-12 bg-slate-900 px-4 py-8 text-sm text-slate-300 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2">
        <div>
          <div className="text-base font-semibold text-white">{c.name}</div>
          <p className="mt-1 text-slate-400">Thiết kế mạch · Gia công PCB · In 3D vỏ hộp</p>
        </div>
        <ul className="space-y-1 sm:text-right">
          <li>
            Zalo:{' '}
            <a className={linkCls} href={c.zaloUrl} target="_blank" rel="noreferrer">
              {c.phone}
            </a>
          </li>
          <li>
            Điện thoại:{' '}
            <a className={linkCls} href={`tel:${c.phone}`}>
              {c.phone}
            </a>
          </li>
          <li>
            Email:{' '}
            <a className={linkCls} href={`mailto:${c.email}`}>
              {c.email}
            </a>
          </li>
          <li>
            Dự án:{' '}
            <a className={linkCls} href={c.githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </footer>
  )
}
