export default function DestinationArt({ src, alt = "Destination preview" }) {
  return (
    <img
      className="dest-art"
      src={src}
      alt={alt}
      loading="lazy"
    />
  );
}
