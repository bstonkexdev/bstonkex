import type { DiscoveryCategory } from '../../lib/market-discovery';

const CATEGORIES: { id: string; label: string; mapped?: DiscoveryCategory }[] = [
  { id: 'hot', label: 'HOT', mapped: 'trending' },
  { id: 'gainers', label: 'GAINERS', mapped: 'gainers' },
  { id: 'new', label: 'NEW', mapped: 'new' },
  { id: 'listing', label: 'LISTING' },
  { id: 'alpha', label: 'ALPHA' },
  { id: 'gem', label: 'GEM' },
  { id: 'pump', label: 'PUMP' },
  { id: 'moonshot', label: 'MOONSHOT' },
  { id: 'memes', label: 'MEMES' },
];

interface Props {
  active: string;
  onChange: (cat: string) => void;
}

export default function CategoryTabs({ active, onChange }: Props) {
  return (
    <div className="market-cat-tabs">
      {CATEGORIES.map(cat => {
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            className={`market-cat-tab ${isActive ? 'active' : ''}`}
            onClick={() => onChange(cat.id)}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

export { CATEGORIES };
export type DiscoveryCategoryExtended = string;