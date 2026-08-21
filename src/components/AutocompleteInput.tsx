import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { IconRef } from '@/domain/types';
import { Icon } from './Icon';

export interface AutocompleteOption {
  value: string;
  label?: string;
  hint?: string;
  iconRef?: IconRef;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (text: string) => void;
  onPick: (option: AutocompleteOption) => void;
  fetchOptions: (query: string) => Promise<AutocompleteOption[]>;
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
}

/** Debounced OSRS-styled autocomplete with keyboard navigation. */
export function AutocompleteInput({
  value,
  onChange,
  onPick,
  fetchOptions,
  placeholder,
  minChars = 2,
  debounceMs = 250,
}: AutocompleteInputProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const suppressFor = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < minChars || suppressFor.current === value) {
      setOpen(false);
      setOptions([]);
      return;
    }
    const mySeq = ++seq.current;
    const handle = setTimeout(() => {
      fetchOptions(query)
        .then((results) => {
          if (seq.current !== mySeq) return;
          setOptions(results);
          setActive(0);
          setOpen(results.length > 0);
        })
        .catch(() => {
          if (seq.current === mySeq) setOpen(false);
        });
    }, debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minChars, debounceMs]);

  function pick(option: AutocompleteOption) {
    suppressFor.current = option.value;
    setOpen(false);
    onPick(option);
  }

  return (
    <div className="autocomplete">
      <input
        className="osrs-input"
        style={{ width: '100%' }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          suppressFor.current = null;
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (options[active]) pick(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        onBlur={() => {
          // Delay so option onMouseDown wins over blur-close.
          setTimeout(() => setOpen(false), 120);
        }}
        onFocus={() => {
          if (options.length > 0 && value.trim().length >= minChars) setOpen(true);
        }}
      />
      {open && (
        <div className="autocomplete__list" role="listbox">
          {options.map((option, i) => (
            <div
              key={`${option.value}-${i}`}
              role="option"
              aria-selected={i === active}
              className={clsx('autocomplete__option', i === active && 'autocomplete__option--active')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {option.iconRef && <Icon iconRef={option.iconRef} size={22} />}
              <span className="autocomplete__label">{option.label ?? option.value}</span>
              {option.hint && <span className="autocomplete__hint">{option.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
