import React from "react";

/**
 * A plain <img> that also understands `fill`, meaning "cover the positioned
 * parent". Kept as a component because several callers rely on that one
 * behaviour; the rest of the props pass straight through.
 */

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
};

export default function Image({ fill, style, ...rest }: ImageProps) {
  if (fill) {
    return <img {...rest} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: (rest as any).objectFit || "cover", ...style }} />;
  }
  return <img {...rest} style={style} />;
}
