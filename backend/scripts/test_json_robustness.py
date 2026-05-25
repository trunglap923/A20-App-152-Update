import json
import re

def repair_json(text: str) -> str:
    stack = []
    in_string = False
    escape = False
    for char in text:
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if char == '"' and not escape:
            in_string = not in_string
            continue
        if not in_string:
            if char == '{': stack.append('}')
            elif char == '[': stack.append(']')
            elif char == '}': 
                if stack and stack[-1] == '}': stack.pop()
            elif char == ']':
                if stack and stack[-1] == ']': stack.pop()
    if in_string: text += '"'
    text = text.rstrip(': ,')
    if text.strip().endswith('"'):
        if not re.search(r':\s*"?$', text):
            text += ': null'
    while stack: text += stack.pop()
    return text

def bulletproof_json_repair(text):
    new_str = ""
    last_pos = 0
    for match in re.finditer(r'"', text):
        pos = match.start()
        left_part = text[:pos].rstrip()
        left_char = left_part[-1] if left_part else ""
        right_part = text[pos+1:].lstrip()
        right_char = right_part[0] if right_part else ""
        
        is_structural = False
        if left_char in '{[,:': is_structural = True
        if right_char == ':': is_structural = True
        if right_char in '}]': is_structural = True
        if right_char == ',':
            after_comma = right_part[1:].lstrip()
            if after_comma and after_comma[0] in '"[{':
                is_structural = True
        
        new_str += text[last_pos:pos]
        new_str += '"' if is_structural else '\\"'
        last_pos = pos + 1
    new_str += text[last_pos:]
    return new_str

def parse_json_safe(raw_text: str) -> dict:
    if not raw_text: return {}
    text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*(.*?)\s*(?:```|$)", text, re.DOTALL)
    if match: text = match.group(1).strip()
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    
    first_brace = text.find("{")
    if first_brace == -1: first_brace = text.find("[")
    json_str = text[first_brace:] if first_brace != -1 else text
    
    try:
        return json.loads(json_str, strict=False)
    except:
        pass

    fixed = bulletproof_json_repair(json_str)
    try:
        repaired = repair_json(fixed)
        return json.loads(repaired, strict=False)
    except Exception as e:
        return {"error": str(e), "fixed": fixed}

def run_tests():
    print("--- 🧪 BẮT ĐẦU KIỂM TRA ĐỘ ỔN ĐỊNH JSON (V8 - Final Scanner) ---")
    
    test_cases = [
        {
            "name": "Case 'quên' lồng phẩy",
            "input": '{"test": "Thông tin có thể bị "quên", dẫn đến kết quả sai."}',
            "expect_key": "test"
        },
        {
            "name": "Case thực tế đầy đủ của người dùng (có [1, 3, 5])",
            "input": """{
  "title": "Thành phần Augmentation",
  "keyConcept": "## Vai trò... bị "quên", dẫn đến... [1, 3, 5, 4, 2].",
  "example": "Ví dụ thực tế..."
}""",
            "expect_key": "title"
        }
    ]

    for case in test_cases:
        print(f"\n[Test] {case['name']}")
        result = parse_json_safe(case['input'])
        if isinstance(result, dict) and case['expect_key'] in result:
            print(f"✅ Thành công: {result}")
        else:
            print(f"❌ Thất bại: {result}")

if __name__ == "__main__":
    run_tests()
