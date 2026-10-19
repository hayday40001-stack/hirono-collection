import { useApp } from '../app/context.tsx';
import { thaiDate } from '../app/format.ts';
import { SOURCE_TYPE_LABEL } from '../domain/labels.ts';
import { safeHttpUrl } from '../domain/schema.ts';
import type { SourceRef } from '../domain/types.ts';
import { IconBack } from '../components/icons.tsx';

export function BackLink() {
  return (
    <button type="button" className="btn quiet small" style={{ justifySelf: 'start', marginLeft: -8 }} onClick={() => (history.length > 1 ? history.back() : (location.hash = '#/explore'))}>
      <IconBack /> กลับ
    </button>
  );
}

export function SourceList({ refs }: { refs: SourceRef[] }) {
  const { data } = useApp();
  if (!refs.length) return <p className="meta">ยังไม่มีแหล่งอ้างอิง ข้อมูลนี้จึงถือว่ายังไม่ยืนยัน</p>;
  return (
    <ul className="sources">
      {refs.map((r, i) => {
        const s = data.sourcesById.get(r.source_id);
        const url = safeHttpUrl(s?.url);
        return (
          <li key={`${r.source_id}-${i}`}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                {s?.title ?? r.source_id}
              </a>
            ) : (
              <span>{s?.title ?? r.source_id}</span>
            )}
            <span className="meta">
              {s ? `${SOURCE_TYPE_LABEL[s.source_type]}, ${s.publisher}, เข้าถึงเมื่อ ${thaiDate(s.accessed_at)}` : 'ไม่พบข้อมูลแหล่งนี้'}
            </span>
            <span className="meta">ยืนยัน: {r.confirms}</span>
            {s?.notes && <span className="meta">{s.notes}</span>}
          </li>
        );
      })}
    </ul>
  );
}
