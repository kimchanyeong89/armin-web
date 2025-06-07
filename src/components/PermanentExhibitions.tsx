import type { ExhibitionItem } from "../types/Exhibition";

interface Props {
  items: ExhibitionItem[];
}

export default function PermanentExhibitions({ items }: Props) {
  return (
    <div>
      {items.length > 0 ? (
        items.map((item) => (
          <div key={item.id}>
            <h4>{item.name}</h4>
            <p>{item.description}</p>
          </div>
        ))
      ) : (
        <p>상설 전시가 없습니다.</p>
      )}
    </div>
  );
}