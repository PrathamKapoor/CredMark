"use client";

import { useMemo, FC, ReactNode } from "react";
import "./GridMotion.css";

interface GridMotionProps {
  items?: (string | ReactNode)[];
  gradientColor?: string;
}

const TOTAL_ROWS = 4;
const ITEMS_PER_ROW = 7;
const TOTAL_ITEMS = TOTAL_ROWS * ITEMS_PER_ROW;
const DEFAULT_ITEMS = Array.from(
  { length: TOTAL_ITEMS },
  (_, index) => `Item ${index + 1}`
);

// Animation durations for each row (in seconds) - varied for visual interest
const ROW_DURATIONS = [45, 50, 55, 60];

const GridMotion: FC<GridMotionProps> = ({
  items = [],
  gradientColor = "black",
}) => {
  const normalizedItems = useMemo<(string | ReactNode)[]>(() => {
    if (items.length === 0) {
      return [...DEFAULT_ITEMS];
    }

    const trimmed = items.slice(0, TOTAL_ITEMS);
    if (trimmed.length < TOTAL_ITEMS) {
      return [...trimmed, ...DEFAULT_ITEMS.slice(trimmed.length)];
    }

    return trimmed;
  }, [items]);

  // Build rows with items for each row
  const rows = useMemo(() => {
    return Array.from({ length: TOTAL_ROWS }, (_, rowIndex) => {
      const rowItems = Array.from({ length: ITEMS_PER_ROW }, (_, itemIndex) => {
        return normalizedItems[rowIndex * ITEMS_PER_ROW + itemIndex];
      });
      return rowItems;
    });
  }, [normalizedItems]);

  const renderItem = (content: string | ReactNode, key: string) => {
    return (
      <div key={key} className="row__item">
        <div className="row__item-inner">
          {typeof content === "string" &&
          (content.startsWith("http") || content.startsWith("/")) ? (
            <div
              className="row__item-img"
              style={{
                backgroundImage: `url(${content})`,
              }}
            />
          ) : (
            <div className="row__item-content">{content}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="noscroll">
      <section
        className="intro"
        style={{
          background: `radial-gradient(circle, ${gradientColor} 0%, transparent 100%)`,
        }}
      >
        <div className="gridMotion-container">
          {rows.map((rowItems, rowIndex) => {
            const isReverse = rowIndex % 2 === 1;
            const duration = ROW_DURATIONS[rowIndex % ROW_DURATIONS.length];

            return (
              <div key={rowIndex} className="row">
                <div
                  className={`row__track ${
                    isReverse ? "row__track--reverse" : ""
                  }`}
                  style={{
                    animationDuration: `${duration}s`,
                  }}
                >
                  {/* Original items */}
                  {rowItems.map((content, itemIndex) =>
                    renderItem(content, `row-${rowIndex}-item-${itemIndex}`)
                  )}
                  {/* Duplicated items for seamless loop */}
                  {rowItems.map((content, itemIndex) =>
                    renderItem(content, `row-${rowIndex}-item-dup-${itemIndex}`)
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="fullview"></div>
      </section>
    </div>
  );
};

export default GridMotion;
