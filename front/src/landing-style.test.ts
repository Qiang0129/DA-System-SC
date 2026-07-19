import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/landing.css'), 'utf8');

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));

  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match[1];
}

function getProperty(rule: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rule.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+);`));

  return match?.[1].trim();
}

function getKeyframes(name: string) {
  const start = css.indexOf(`@keyframes ${name}`);

  if (start === -1) {
    throw new Error(`Missing keyframes for ${name}`);
  }

  const firstBrace = css.indexOf('{', start);
  let depth = 0;

  for (let index = firstBrace; index < css.length; index += 1) {
    const char = css[index];

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unclosed keyframes for ${name}`);
}

function getReducedMotionBlock() {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');

  if (start === -1) {
    throw new Error('Missing reduced motion media block');
  }

  return css.slice(start);
}

describe('landing URL copy button styles', () => {
  it('renders the topbar brand logo as a clipped local image', () => {
    const brandLogoRule = getRule('.landing-brand .brand-logo');
    const brandLogoImageRule = getRule('.brand-logo-image');

    expect(getProperty(brandLogoRule, 'width')).toBe('32px');
    expect(getProperty(brandLogoRule, 'height')).toBe('32px');
    expect(getProperty(brandLogoRule, 'overflow')).toBe('hidden');
    expect(getProperty(brandLogoImageRule, 'width')).toBe('100%');
    expect(getProperty(brandLogoImageRule, 'height')).toBe('100%');
    expect(getProperty(brandLogoImageRule, 'display')).toBe('block');
    expect(getProperty(brandLogoImageRule, 'object-fit')).toBe('cover');
    expect(getProperty(brandLogoImageRule, 'object-position')).toBe('center');
  });

  it('lays out the document workflow cards in three desktop columns', () => {
    const capabilityGridRule = getRule('.capability-grid');

    expect(getProperty(capabilityGridRule, 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('renders workflow card markers as cyan glowing 3D dots', () => {
    const markerRule = getRule('.capability-icon');
    const cardTitleRule = getRule('.capability-card h3');

    expect(getProperty(markerRule, 'width')).toBe('12px');
    expect(getProperty(markerRule, 'height')).toBe('12px');
    expect(getProperty(markerRule, 'border-radius')).toBe('999px');
    expect(getProperty(markerRule, 'background') ?? '').toContain('radial-gradient');
    expect(getProperty(markerRule, 'background') ?? '').toContain('#10d9a6');
    expect(getProperty(markerRule, 'box-shadow') ?? '').toContain('rgba(16, 217, 166');
    expect(getProperty(cardTitleRule, 'margin')).toBe('26px 0 10px');
    expect(css).not.toContain('.capability-icon::before');
    expect(css).not.toContain('.capability-icon::after');
  });

  it('aligns capability labels directly under enlarged icons', () => {
    const gridRule = getRule('.capability-mark-grid');
    const markRule = getRule('.capability-mark');
    const iconRule = getRule('.capability-mark-icon');
    const labelRule = getRule('.capability-mark-label');

    expect(getProperty(gridRule, 'display')).toBe('grid');
    expect(getProperty(gridRule, 'grid-template-columns')).toBe('repeat(8, minmax(72px, 1fr))');
    expect(getProperty(markRule, 'flex-direction')).toBe('column');
    expect(getProperty(markRule, 'align-items')).toBe('center');
    expect(getProperty(iconRule, 'width')).toBe('52px');
    expect(getProperty(iconRule, 'height')).toBe('52px');
    expect(getProperty(iconRule, 'object-fit')).toBe('contain');
    expect(getProperty(labelRule, 'position')).toBe('static');
    expect(labelRule).not.toContain('clip: rect');
  });

  it('renders the topbar version as a right-aligned blue badge', () => {
    const versionRule = getRule('.landing-version-pill');

    expect(getProperty(versionRule, 'justify-self')).toBe('end');
    expect(getProperty(versionRule, 'border-radius')).toBe('999px');
    expect(getProperty(versionRule, 'border')).toBe('1px solid rgba(64, 158, 255, 0.24)');
    expect(getProperty(versionRule, 'background')).toBe('rgba(64, 158, 255, 0.12)');
    expect(getProperty(versionRule, 'color')).toBe('#245f9f');
    expect(getProperty(versionRule, 'box-shadow') ?? '').toContain('rgba(51, 126, 204, 0.45)');
  });

  it('provides motion feedback for the analysis workbench action', () => {
    const buttonRule = getRule('.landing-link-button');

    expect(getProperty(buttonRule, 'transition') ?? '').toContain('transform 180ms');
    expect(css).toMatch(/\.landing-link-button:hover,\s*\.landing-link-button:focus-visible\s*\{[\s\S]*?transform:\s*translateY\(-2px\);/);
    expect(css).toMatch(/\.landing-link-button:hover \.landing-link-button-icon,\s*\.landing-link-button:focus-visible \.landing-link-button-icon\s*\{[\s\S]*?transform:\s*translateX\(3px\);/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders the auth card as a glassmorphism surface', () => {
    const authCardRule = getRule('.auth-card');
    const authInputRule = getRule('.auth-input');
    const authSubtitleRule = getRule('.auth-card-subtitle');
    const authSwitchRule = getRule('.auth-switch');
    const authBackRule = getRule('.auth-back');

    expect(getProperty(authCardRule, 'border')).toBe('none');
    expect(getProperty(authCardRule, 'background') ?? '').toContain('linear-gradient');
    expect(getProperty(authCardRule, 'background') ?? '').toContain('rgba(255, 255, 255, 0.26)');
    expect(getProperty(authCardRule, 'backdrop-filter')).toBe('blur(40px) saturate(200%)');
    expect(getProperty(authCardRule, '-webkit-backdrop-filter')).toBe('blur(40px) saturate(200%)');
    expect(getProperty(authCardRule, 'box-shadow') ?? '').not.toContain('inset');
    expect(getProperty(authCardRule, 'box-shadow') ?? '').toContain('0 30px 76px -34px');
    expect(getProperty(authInputRule, 'background')).toBe('rgba(248, 250, 252, 0.55)');
    expect(getProperty(authInputRule, 'backdrop-filter')).toBe('blur(14px) saturate(160%)');
    expect(getProperty(authSubtitleRule, 'color')).toBe('rgba(71, 85, 105, 0.74)');
    expect(getProperty(authSwitchRule, 'color')).toBe('rgba(71, 85, 105, 0.72)');
    expect(getProperty(authBackRule, 'color')).toBe('rgba(71, 85, 105, 0.64)');
  });

  it('gives auth submit buttons a compact interactive loading state', () => {
    const submitRule = getRule('.auth-submit');
    const activeRule = getRule('.auth-submit:not(:disabled):active');
    const spinnerRule = getRule('.auth-submit-spinner');
    const spinKeyframes = getKeyframes('auth-submit-spin');
    const reducedMotion = getReducedMotionBlock();

    expect(getProperty(submitRule, 'border-radius')).toBe('8px');
    expect(getProperty(submitRule, 'min-height')).toBe('46px');
    expect(getProperty(submitRule, 'transition') ?? '').toContain('transform 180ms');
    expect(getProperty(activeRule, 'transform')).toBe('translateY(1px) scale(0.985)');
    expect(getProperty(spinnerRule, 'animation')).toBe('auth-submit-spin 720ms linear infinite');
    expect(spinKeyframes).toContain('rotate(360deg)');
    expect(reducedMotion).toContain('.auth-submit-spinner');
  });

  it('uses a horizontal 3D flip for login and register card switching', () => {
    const flipRule = getRule('.auth-flip');
    const innerRule = getRule('.auth-flip-inner');
    const flippedRule = getRule('.auth-flip.is-flipped .auth-flip-inner');
    const faceRule = getRule('.auth-flip-face');
    const backRule = getRule('.auth-flip-back');
    const reducedMotion = getReducedMotionBlock();

    expect(getProperty(flipRule, 'perspective')).toBe('1600px');
    expect(getProperty(innerRule, 'transform-style')).toBe('preserve-3d');
    expect(getProperty(innerRule, 'transition') ?? '').toContain('transform 620ms');
    expect(getProperty(flippedRule, 'transform')).toBe('rotateY(180deg)');
    expect(getProperty(faceRule, 'backface-visibility')).toBe('hidden');
    expect(getProperty(backRule, 'transform')).toBe('rotateY(180deg)');
    expect(reducedMotion).toContain('.auth-flip-inner');
  });

  it('renders the auth background image as a viewport-adaptive cover', () => {
    const authPageRule = getRule('.auth-page');

    expect(getProperty(authPageRule, 'background-image') ?? '').toContain("url('./images/登录注册背景图.png')");
    expect(getProperty(authPageRule, 'background-size')).toBe('cover');
    expect(getProperty(authPageRule, 'background-position')).toBe('center center');
    expect(getProperty(authPageRule, 'background-repeat')).toBe('no-repeat');
  });

  it('matches the new-api neutral icon button dimensions', () => {
    const rowRule = getRule('.base-url-row');
    const copyRule = getRule('.base-url-copy');

    expect(getProperty(rowRule, 'grid-template-columns')).toBe('minmax(0, 1fr) auto 28px');
    expect(getProperty(copyRule, 'width')).toBe('28px');
    expect(getProperty(copyRule, 'height')).toBe('28px');
    expect(getProperty(copyRule, 'background')).toBe('transparent');
    expect(getProperty(copyRule, 'color')).toBe('var(--app-text-muted)');
    expect(copyRule).not.toContain('#0062D6');
  });

  it('matches the new-api URL text typography and endpoint animation', () => {
    const rowRule = getRule('.base-url-row');
    const addressRule = getRule('.base-url-address');
    const endpointRule = getRule('.base-url-endpoint');

    expect(getProperty(rowRule, 'font-family') ?? '').toContain('Inter');
    expect(getProperty(rowRule, 'text-align')).toBe('left');
    expect(getProperty(rowRule, 'line-height')).toBe('1');

    expect(getProperty(addressRule, 'font-size')).toBe('15px');
    expect(getProperty(addressRule, 'font-weight')).toBe('400');
    expect(getProperty(addressRule, 'color')).toBe('var(--app-text-primary)');
    expect(getProperty(addressRule, 'overflow')).toBe('visible');

    expect(getProperty(endpointRule, 'font-size')).toBe('14px');
    expect(getProperty(endpointRule, 'font-weight')).toBe('600');
    expect(getProperty(endpointRule, 'line-height')).toBe('1.25');
    expect(getProperty(endpointRule, 'color')).toBe('#0064fa');
    expect(getProperty(endpointRule, 'animation')).toBe(
      'base-url-endpoint-enter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
    );
  });

  it('keeps the workbench SVG aligned with the analysis workbench action', () => {
    const iconRule = getRule('.landing-link-button-icon');

    expect(getProperty(iconRule, 'width')).toBe('16px');
    expect(getProperty(iconRule, 'height')).toBe('16px');
    expect(getProperty(iconRule, 'flex')).toBe('0 0 16px');
    expect(getProperty(iconRule, 'filter')).toBe('brightness(0) invert(1)');
  });

  it('keeps the animated endpoint anchored to the same baseline', () => {
    const endpointKeyframes = getKeyframes('base-url-endpoint-enter');

    expect(endpointKeyframes).not.toContain('translateY');
    expect(endpointKeyframes).not.toContain('transform:');
  });

  it('hides the landing viewport scrollbar while keeping scrolling enabled', () => {
    // 视觉上隐藏滚动条（保留滚动功能），且作用域只锁首页 LandingPage 挂载时。
    expect(css).toContain('body.landing-scroll-hidden');
    expect(css).toContain('scrollbar-width: none');
    expect(css).toContain('::-webkit-scrollbar');

    // 这条规则不许引入 overflow: hidden，否则会锁死视口滚动。
    const bodyRule = getRule('body.landing-scroll-hidden');
    expect(bodyRule).not.toContain('overflow: hidden');
    expect(bodyRule).not.toContain('overflow-y: hidden');
  });

  it('animates auth route entry and preserves reduced-motion support', () => {
    const authPageRule = getRule('.auth-page');
    const authCardRule = getRule('.auth-card');
    const heroButtonRule = getRule('.hero-btn');
    const heroButtonActiveRule = getRule('.hero-btn:active');
    const pageKeyframes = getKeyframes('auth-page-enter');
    const cardKeyframes = getKeyframes('auth-card-enter');
    const reducedMotionBlock = getReducedMotionBlock();

    expect(getProperty(authPageRule, 'animation')).toBe(
      'auth-page-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) both',
    );
    expect(getProperty(authCardRule, 'animation')).toBe(
      'auth-card-enter 0.48s cubic-bezier(0.22, 1, 0.36, 1) both',
    );
    expect(getProperty(heroButtonRule, 'transition')).toBe('transform 0.2s ease, box-shadow 0.2s ease');
    expect(getProperty(heroButtonActiveRule, 'transform')).toBe('translateY(1px) scale(0.985)');

    expect(pageKeyframes).toContain('opacity: 0');
    expect(pageKeyframes).toContain('filter: blur(6px)');
    expect(pageKeyframes).toContain('filter: blur(0)');
    expect(cardKeyframes).toContain('opacity: 0');
    expect(cardKeyframes).toContain('transform: translateY(10px) scale(0.985)');
    expect(cardKeyframes).toContain('transform: none');

    expect(reducedMotionBlock).toContain('.auth-page');
    expect(reducedMotionBlock).toContain('.auth-card');
    expect(reducedMotionBlock).toContain('.hero-btn');
    expect(reducedMotionBlock).toContain('animation: none');
    expect(reducedMotionBlock).toContain('transition: none');
  });
});
