import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import "react-day-picker/dist/style.css";

/** 轻量日历（react-day-picker 封装，项目无 shadcn calendar，按需自写） */
export function Calendar(props: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={zhCN}
      className="rdp-custom"
      {...props}
    />
  );
}
