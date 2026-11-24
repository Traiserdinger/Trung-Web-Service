import { useState } from 'react'
import { IconSearch } from './icons.tsx'
import { inputCls } from './styles.ts'

interface Props {
  value?: string
  onChange?: (v: string) => void
  /** Không có onChange: gõ xong Enter thì gọi onSubmit */
  onSubmit?: (v: string) => void
}

/** Ô tìm theo mã, tên hoặc SĐT */
export function SearchBox({ value, onChange, onSubmit }: Props) {
  const [own, setOwn] = useState('')
  const v = value ?? own
  return (
    <form
      role="search"
      className="relative w-full sm:w-[300px]"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(v.trim())
      }}
    >
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate">
        <IconSearch />
      </span>
      <input
        type="search"
        value={v}
        onChange={(e) => (onChange ? onChange(e.target.value) : setOwn(e.target.value))}
        placeholder="Tìm mã, tên hoặc SĐT"
        aria-label="Tìm kiếm"
        className={`${inputCls} pl-10`}
      />
    </form>
  )
}
