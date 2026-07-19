import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 260;
const VIEWPORT_PADDING = 12;

function getNextEnabledIndex(options: SelectFieldOption[], startIndex: number, direction: 1 | -1) {
  if (options.length === 0) return -1;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + offset * direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }

  return -1;
}

export function SelectField({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  placeholder = '请选择',
  disabled = false,
  className,
  size = 'md',
}: SelectFieldProps) {
  const reactId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const listboxId = `select-field-${reactId}-listbox`;
  const labelId = label ? `select-field-${reactId}-label` : undefined;
  const activeOption = activeIndex >= 0 ? options[activeIndex] : null;
  const activeOptionId = activeOption ? `${listboxId}-option-${activeIndex}` : undefined;
  const isDisabled = disabled || options.length === 0;

  function getInitialActiveIndex() {
    if (selectedIndex >= 0 && !options[selectedIndex].disabled) return selectedIndex;
    return options.findIndex((option) => !option.disabled);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
    const availableAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
    const shouldOpenAbove = availableBelow < 160 && availableAbove > availableBelow;
    const availableHeight = shouldOpenAbove ? availableAbove : availableBelow;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, Math.max(120, availableHeight));

    setMenuPosition({
      top: shouldOpenAbove
        ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - maxHeight)
        : rect.bottom + MENU_GAP,
      left: Math.max(VIEWPORT_PADDING, rect.left),
      width: rect.width,
      maxHeight,
    });
  }

  function openMenu() {
    if (isDisabled) return;
    setActiveIndex(getInitialActiveIndex());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setMenuPosition(null);
  }

  function commitOption(option: SelectFieldOption) {
    if (option.disabled) return;
    if (option.value !== value) {
      onChange(option.value);
    }
    closeMenu();
    triggerRef.current?.focus();
  }

  function moveActiveIndex(direction: 1 | -1) {
    const baseIndex = activeIndex >= 0 ? activeIndex : getInitialActiveIndex();
    const nextIndex = getNextEnabledIndex(options, baseIndex, direction);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(getInitialActiveIndex());
  }, [open, value, options]);

  const rootClassName = [
    'select-field',
    `select-field-${size}`,
    open ? 'is-open' : '',
    isDisabled ? 'is-disabled' : '',
    selectedOption ? '' : 'is-empty',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const menu = open && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="select-field-menu"
          role="listbox"
          aria-label={ariaLabel ?? label}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value || `empty-${index}`}
              id={`${listboxId}-option-${index}`}
              className={[
                'select-field-option',
                option.value === value ? 'is-selected' : '',
                activeIndex === index ? 'is-active' : '',
                option.disabled ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              title={option.label}
              onMouseEnter={() => {
                if (!option.disabled) setActiveIndex(index);
              }}
              onClick={() => commitOption(option)}
            >
              {option.label}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className={rootClassName}>
      {label ? (
        <span id={labelId} className="select-field-label">
          {label}
        </span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className="select-field-trigger"
        role="combobox"
        aria-label={ariaLabel ?? label}
        aria-labelledby={ariaLabel ? undefined : labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? activeOptionId : undefined}
        disabled={isDisabled}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (isDisabled) return;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActiveIndex(1);
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActiveIndex(-1);
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            const option = options[activeIndex];
            if (option) commitOption(option);
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu();
          }
        }}
      >
        <span className="select-field-trigger-value" title={selectedOption?.label}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
