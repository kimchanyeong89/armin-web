import type { ExhibitionItem } from "../types/Exhibition";

interface Props {
  items: ExhibitionItem[];
}

export default function TemporaryExhibitions({ items }: Props) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          <h4>{item.name}</h4>
          <p>{item.description}</p>
          <p>{item.startDate} ~ {item.endDate}</p>
        </div>
      ))}
    </div>
  );
}