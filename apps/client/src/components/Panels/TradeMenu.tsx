import { useMemo, useState } from 'react';
import { ResourceBundle, ResourceType } from '@catanx/engine';
import { MARKET_RESOURCES } from '../../data/gameplayCatalog';
import { frResource } from '../../i18n/fr';
import styles from './TradeMenu.module.css';

interface TradeMenuProps { prices: Record<string,number>; resources: ResourceBundle; demand?: Record<string,number>; supply?: Record<string,number>; onBuy:(resource:ResourceType, quantity:number)=>void; onSell:(resource:ResourceType, quantity:number)=>void; onClose:()=>void; }
const CATAN_MARKET_RESOURCES: ResourceType[] = ['wood', 'clay', 'sheep', 'wheat', 'ore'];

export function TradeMenu({ prices, resources, demand, supply, onBuy, onSell, onClose }: TradeMenuProps) {
  const [quantity, setQuantity] = useState(1);
  const tradable = useMemo(() => MARKET_RESOURCES.filter((resource) => CATAN_MARKET_RESOURCES.includes(resource)).map((resource) => ({ resource, price:prices[resource] ?? 0, demand:demand?.[resource] ?? 0, supply:supply?.[resource] ?? 0 })).filter((entry) => entry.price > 0).sort((a,b) => b.price-a.price), [demand,prices,supply]);
  return <section className={`ui-panel ${styles.menu}`} aria-label="Commerce">
    <header className={styles.header}><div><strong>Marché</strong><span>{Math.floor(resources.coins ?? 0)} pièces</span></div><button type="button" className="command-button secondary" onClick={onClose}>Rétracter</button></header>
    <div className={styles.quantity}><span>Quantité</span><button type="button" onClick={() => setQuantity((value) => Math.max(1,value-1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity((value) => Math.min(99,value+1))}>+</button></div>
    <div className={styles.list}>{tradable.map(({resource,price,demand:demandValue,supply:supplyValue}) => {
      const owned=Math.floor(resources[resource] ?? 0); const buyCost=price*quantity; const sellGain=Math.max(1,Math.floor(price*quantity*.75)); const pressure=demandValue-supplyValue;
      return <article key={resource} className={styles.row} data-resource={resource}>
        <div><strong>{frResource(resource)}</strong><span>Vous : {owned} · cours {price}</span></div>
        <small className={pressure > 0 ? styles.rising : pressure < 0 ? styles.falling : ''}>{pressure > 0 ? '↑ demande' : pressure < 0 ? '↓ offre' : 'stable'}</small>
        <div className={styles.rowActions}><button disabled={(resources.coins ?? 0) < buyCost} onClick={() => onBuy(resource,quantity)}>Acheter {buyCost}</button><button disabled={owned < quantity} onClick={() => onSell(resource,quantity)}>Vendre +{sellGain}</button></div>
      </article>;
    })}</div>
  </section>;
}
