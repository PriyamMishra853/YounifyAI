/**
 * Splits text into word-wrapped character spans (class "ch") for GSAP.
 * Screen readers get the plain text once via aria-label on the wrapper.
 */
export default function SplitText({ text, className = '', charClass = '' }) {
  const words = text.split(' ')
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, wi) => (
        <span key={wi} aria-hidden="true" className="inline-block whitespace-nowrap">
          {[...w].map((c, ci) => (
            <span key={ci} className={`ch inline-block will-change-transform ${charClass}`}>{c}</span>
          ))}
          {wi < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  )
}
