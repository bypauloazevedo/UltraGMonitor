using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace HudSensor
{
    internal sealed class JsonWriter
    {
        private readonly StringBuilder _sb = new StringBuilder(1024);
        private readonly Stack<bool> _needsComma = new Stack<bool>();

        public JsonWriter BeginObject(string name = null)
        {
            Key(name);
            _sb.Append('{');
            _needsComma.Push(false);
            return this;
        }

        public JsonWriter EndObject()
        {
            _sb.Append('}');
            _needsComma.Pop();
            return this;
        }

        public JsonWriter BeginArray(string name = null)
        {
            Key(name);
            _sb.Append('[');
            _needsComma.Push(false);
            return this;
        }

        public JsonWriter EndArray()
        {
            _sb.Append(']');
            _needsComma.Pop();
            return this;
        }

        public JsonWriter Prop(string name, string value)
        {
            Key(name);
            if (value == null) _sb.Append("null");
            else WriteString(value);
            return this;
        }

        public JsonWriter Prop(string name, bool value)
        {
            Key(name);
            _sb.Append(value ? "true" : "false");
            return this;
        }

        public JsonWriter Prop(string name, double? value, int decimals = 1)
        {
            Key(name);
            if (value == null || double.IsNaN(value.Value) || double.IsInfinity(value.Value)) _sb.Append("null");
            else _sb.Append(System.Math.Round(value.Value, decimals).ToString(CultureInfo.InvariantCulture));
            return this;
        }

        public JsonWriter Null(string name)
        {
            Key(name);
            _sb.Append("null");
            return this;
        }

        public override string ToString() => _sb.ToString();

        private void Key(string name)
        {
            if (_needsComma.Count > 0)
            {
                if (_needsComma.Peek()) _sb.Append(',');
                _needsComma.Pop();
                _needsComma.Push(true);
            }
            if (name == null) return;
            WriteString(name);
            _sb.Append(':');
        }

        private void WriteString(string value)
        {
            _sb.Append('"');
            foreach (var c in value)
            {
                switch (c)
                {
                    case '"': _sb.Append("\\\""); break;
                    case '\\': _sb.Append("\\\\"); break;
                    case '\n': _sb.Append("\\n"); break;
                    case '\r': _sb.Append("\\r"); break;
                    case '\t': _sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) _sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else _sb.Append(c);
                        break;
                }
            }
            _sb.Append('"');
        }
    }
}
