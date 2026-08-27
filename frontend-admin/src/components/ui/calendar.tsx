import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/dist/style.css";

/** 轻量日历（react-day-picker 封装）。
 *  captionLayout="dropdown-buttons"：头部显示 年/月 下拉 + 前后翻页按钮，可快速跳转任意年月。
 *  fromYear/toYear：下拉年份范围（覆盖工单历史与未来排期）。
 */
export function Calendar(props: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={zhCN}
      captionLayout="dropdown-buttons"
      fromYear={2020}
      toYear={2035}
      className="rdp-custom"
      {...props}
    />
  );
}
