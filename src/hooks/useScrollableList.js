import { useMemo } from 'react';

export function useScrollableList(list, selectedIndex, terminalHeight, headerOffset = 5, minVisible = 5) {
  return useMemo(() => {
    const contentHeight = terminalHeight - headerOffset;
    const listVisible = Math.max(minVisible, contentHeight);
    const maxScroll = Math.max(0, list.length - listVisible);
    const scrollOffset = Math.max(0, Math.min(
      selectedIndex - Math.floor(listVisible / 2),
      maxScroll
    ));
    const visibleList = list.slice(scrollOffset, scrollOffset + listVisible);
    const hasMoreAbove = scrollOffset > 0;
    const hasMoreBelow = scrollOffset + listVisible < list.length;
    const aboveCount = scrollOffset;
    const belowCount = list.length - scrollOffset - listVisible;

    return {
      listVisible,
      scrollOffset,
      visibleList,
      hasMoreAbove,
      hasMoreBelow,
      aboveCount,
      belowCount
    };
  }, [list, selectedIndex, terminalHeight, headerOffset, minVisible]);
}
