import { useMemo } from 'react';

/**
 * useScrollableList — 虚拟滚动 Hook
 *
 * 根据终端高度动态计算可见窗口，避免渲染超出屏幕的列表项。
 * 策略：以选中项为中心，上下各留一半可见区，超出部分用 "↑ N" / "↓ N" 指示。
 *
 * @param {Array}  list           - 完整列表
 * @param {number} selectedIndex  - 当前选中索引
 * @param {number} terminalHeight - 终端行数
 * @param {number} headerOffset   - 顶部固定占用的行数（标题栏+分割线+底部栏）
 * @param {number} minVisible     - 最小可见项数
 * @returns {Object} { visibleList, scrollOffset, hasMoreAbove, hasMoreBelow, aboveCount, belowCount }
 */
export function useScrollableList(list, selectedIndex, terminalHeight, headerOffset = 5, minVisible = 5) {
  return useMemo(() => {
    const contentHeight = terminalHeight - headerOffset;
    const listVisible = Math.max(minVisible, contentHeight);
    const maxScroll = Math.max(0, list.length - listVisible);

    // 以选中项为中心定位滚动窗口
    const scrollOffset = Math.max(0, Math.min(
      selectedIndex - Math.floor(listVisible / 2),
      maxScroll
    ));

    const visibleList = list.slice(scrollOffset, scrollOffset + listVisible);
    const hasMoreAbove = scrollOffset > 0;
    const hasMoreBelow = scrollOffset + listVisible < list.length;

    return {
      listVisible,
      scrollOffset,
      visibleList,
      hasMoreAbove,
      hasMoreBelow,
      aboveCount: scrollOffset,
      belowCount: list.length - scrollOffset - listVisible
    };
  }, [list, selectedIndex, terminalHeight, headerOffset, minVisible]);
}
