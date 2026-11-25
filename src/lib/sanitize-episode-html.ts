import sanitizeHtml from 'sanitize-html'

export function sanitizeEpisodeHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4',
      'h5', 'hr', 'i', 'iframe', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'u', 'ul',
    ],
    allowedAttributes: {
      a: ['class', 'href', 'id', 'rel', 'target', 'title'],
      blockquote: ['class', 'id'],
      code: ['class', 'id'],
      div: ['class', 'id'],
      figure: ['class', 'id'],
      h2: ['class', 'id'],
      h3: ['class', 'id'],
      h4: ['class', 'id'],
      h5: ['class', 'id'],
      iframe: ['allow', 'allowfullscreen', 'frameborder', 'height', 'loading', 'src', 'title', 'width'],
      img: ['alt', 'class', 'height', 'loading', 'src', 'width'],
      li: ['class', 'id'],
      p: ['class', 'id'],
      pre: ['class', 'id'],
      span: ['class', 'id'],
    },
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com'],
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  })
}
