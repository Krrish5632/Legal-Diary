import { useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import './filepick.css';

interface Props {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  buttonText?: string;
  onPick: (files: File[]) => void;
}

const sizeText = (n: number): string =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** A clear "Choose file" button that always shows which file was picked. */
export function FilePick({ accept, multiple = false, disabled = false, buttonText = 'Choose file', onPick }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) return;
    setFiles(list);
    onPick(list);
  }

  // Clearing before the picker opens lets the same file be chosen again.
  function onInputClick(e: MouseEvent<HTMLInputElement>) {
    e.currentTarget.value = '';
  }

  let label = 'No file selected yet';
  if (files.length === 1) label = 'Selected: ' + files[0].name + ' (' + sizeText(files[0].size) + ')';
  else if (files.length > 1) label = files.length + ' files selected: ' + files.map(f => f.name).join(', ');

  return (
    <div className="fp">
      <input
        ref={ref}
        className="fp-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
        onClick={onInputClick}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button type="button" className="btn" disabled={disabled} onClick={() => ref.current?.click()}>
        {buttonText}
      </button>
      <div className={files.length > 0 ? 'fp-name fp-has' : 'fp-name'} role="status">{label}</div>
    </div>
  );
}
// end of FilePick.tsx
