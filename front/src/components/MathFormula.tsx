import { useMemo } from 'react';
import katex from 'katex';

type Props = {
  latex: string;
  label: string;
  displayMode?: boolean;
  className?: string;
};

export function MathFormula({ latex, label, displayMode = false, className = '' }: Props) {
  const markup = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        output: 'htmlAndMathml',
        throwOnError: false,
        strict: 'warn',
        trust: false,
      });
    } catch {
      return null;
    }
  }, [displayMode, latex]);

  if (!markup) {
    return <span className={`math-formula math-formula-fallback ${className}`} aria-label={label}>{label}</span>;
  }

  return (
    <span
      className={`math-formula ${displayMode ? 'math-formula-display' : ''} ${className}`}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
