import { LinkItem } from "../types";

interface PreviewProps {
  link: LinkItem | null;
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

export default function Preview({ link }: PreviewProps) {
  if (!link) {
    return (
      <div className="preview-empty">
        <p>Click a link to preview it here.</p>
      </div>
    );
  }

  if (link.link_type === "youtube") {
    const videoId = getYouTubeVideoId(link.url);
    if (videoId) {
      return (
        <div className="preview">
          <div className="preview-header">
            <span className="preview-title">{link.title}</span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="preview-open"
            >
              Open in browser ↗
            </a>
          </div>
          <iframe
            className="preview-iframe youtube"
            src={`https://www.youtube.com/embed/${videoId}`}
            title={link.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  return (
    <div className="preview">
      <div className="preview-header">
        <span className="preview-title">{link.title}</span>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-open"
        >
          Open in browser ↗
        </a>
      </div>
      <iframe
        className="preview-iframe"
        src={link.url}
        title={link.title}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
