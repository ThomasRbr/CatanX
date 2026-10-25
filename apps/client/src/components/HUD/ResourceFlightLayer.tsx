import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './ResourceFlightLayer.module.css';

interface ResourceFlightDetail {
  label?: string;
  resource?: string;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
}

interface Flight extends ResourceFlightDetail {
  id: number;
  label: string;
  resource: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

type FlightStyle = CSSProperties & {
  '--flight-x': string;
  '--flight-y': string;
};

/** DOM flight above the Canvas: board production visibly lands in the resource hand. */
export function ResourceFlightLayer() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const onResource = (event: Event) => {
      const detail = (event as CustomEvent<ResourceFlightDetail>).detail;
      if (!detail?.from || !detail.to || !detail.label) return;
      const id = nextId.current++;
      const flight: Flight = {
        id,
        label: detail.label,
        resource: detail.resource ?? 'generic',
        from: detail.from,
        to: detail.to,
      };
      setFlights((current) => [...current.slice(-7), flight]);
      window.setTimeout(() => {
        setFlights((current) => current.filter((item) => item.id !== id));
      }, 1050);
    };

    window.addEventListener('catanx:resource-float', onResource);
    return () => window.removeEventListener('catanx:resource-float', onResource);
  }, []);

  if (flights.length === 0) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      {flights.map((flight) => {
        const style: FlightStyle = {
          left: flight.from.x,
          top: flight.from.y,
          '--flight-x': `${flight.to.x - flight.from.x}px`,
          '--flight-y': `${flight.to.y - flight.from.y}px`,
        };
        return (
          <div
            key={flight.id}
            className={styles.flight}
            data-resource={flight.resource}
            data-direction={
              flight.label.trim().startsWith('−') || flight.label.trim().startsWith('-')
                ? 'out'
                : 'in'
            }
            style={style}
          >
            <span className={styles.token} />
            <span className={styles.label}>{flight.label}</span>
          </div>
        );
      })}
    </div>
  );
}
