import { Icon } from './ui.jsx';

/**
 * Sterowanie widokiem w trybie TV. Te same akcje co klawisze pilota, ale
 * w postaci dużych przycisków - przeglądarki telewizyjne (np. TVBro) często
 * pracują w trybie emulowanego kursora, w którym krzyżak przesuwa wskaźnik
 * zamiast wysyłać strzałki do strony.
 */
export default function TvPad({ onStep, onZoomIn, onZoomOut, onFit }) {
  return (
    <div className="tv-pad" role="group" aria-label="Sterowanie widokiem grafu">
      <div className="tv-pad-grid">
        <button className="tv-key up" onClick={() => onStep('up')} title="Zadanie wyżej">
          <Icon name="chevronUp" size={24} strokeWidth={2.4} />
        </button>
        <button className="tv-key left" onClick={() => onStep('left')} title="Zadanie w lewo">
          <Icon name="chevronLeft" size={24} strokeWidth={2.4} />
        </button>
        <button className="tv-key mid" onClick={onFit} title="Pokaż cały graf">
          <Icon name="fit" size={20} strokeWidth={2.2} />
        </button>
        <button className="tv-key right" onClick={() => onStep('right')} title="Zadanie w prawo">
          <Icon name="chevronRight" size={24} strokeWidth={2.4} />
        </button>
        <button className="tv-key down" onClick={() => onStep('down')} title="Zadanie niżej">
          <Icon name="chevronDown" size={24} strokeWidth={2.4} />
        </button>
      </div>

      <div className="tv-zoom">
        <button className="tv-key" onClick={onZoomOut} title="Oddal">
          <Icon name="minus" size={22} strokeWidth={2.6} />
        </button>
        <button className="tv-key" onClick={onZoomIn} title="Przybliż">
          <Icon name="plus" size={22} strokeWidth={2.6} />
        </button>
      </div>

      <p className="tv-pad-hint">
        Strzałki – kolejne zadanie · <b>+</b> / <b>−</b> – zoom · <b>0</b> – cały graf
      </p>
    </div>
  );
}
