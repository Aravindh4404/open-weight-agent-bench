# marshmallow-code__marshmallow-1343 — Exact Commands Run

Instance: `marshmallow-code__marshmallow-1343`
Repo: `marshmallow-code/marshmallow`
Base commit: `2be2d83a1a9a6d3d9b85804f3ab545cecc409bb0`

Run in Git Bash (MINGW64). Picks up from a fresh `~/open-weight-agent-bench`.

---

## 1. Clone clean + grading copies

```bash
cd ~/open-weight-agent-bench
mkdir -p tasks/marshmallow-1343
cd tasks/marshmallow-1343

git clone https://github.com/marshmallow-code/marshmallow.git clean
cd clean && git checkout 2be2d83a1a9a6d3d9b85804f3ab545cecc409bb0 && rm -rf .git && cd ..

git clone https://github.com/marshmallow-code/marshmallow.git grading
cd grading && git checkout 2be2d83a1a9a6d3d9b85804f3ab545cecc409bb0
```

Verify:
```bash
ls -la ~/open-weight-agent-bench/tasks/marshmallow-1343/clean/.git 2>&1   # should say "No such file or directory"
ls -la ~/open-weight-agent-bench/tasks/marshmallow-1343/grading/.git     # should exist
```

---

## 2. Build the grading venv (Python 3.9 — needed for this old codebase)

```bash
cd ~/open-weight-agent-bench/tasks/marshmallow-1343/grading
py -0   # confirm 3.9 is listed; if not: winget install Python.Python.3.9 (new Git Bash window after)
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
pip install simplejson
```

Note: Python 3.11 and 3.14 both fail on this codebase (`distutils` removed
in 3.12+, `collections.Mapping` removed in 3.10+). 3.9 is required.

---

## 3. Apply the test_patch to grading/ (manual edit, git apply failed on this diff)

```bash
cd ~/open-weight-agent-bench/tasks/marshmallow-1343/grading
```

Fix the import line:
```bash
sed -i 's/from marshmallow import fields, Schema$/from marshmallow import fields, Schema, validates/' tests/test_marshalling.py
```

Append the new test:
```bash
cat >> tests/test_marshalling.py << 'EOF'

    # Regression test for https://github.com/marshmallow-code/marshmallow/issues/1342
    def test_deserialize_wrong_nested_type_with_validates_method(self, unmarshal):
        class TestSchema(Schema):
            value = fields.String()

            @validates('value')
            def validate_value(self, value):
                pass

        data = {
            'foo': 'not what we need'
        }
        fields_dict = {
            'foo': fields.Nested(TestSchema, required=True)
        }
        with pytest.raises(ValidationError) as excinfo:
            result = unmarshal.deserialize(data, fields_dict)

        assert result is None
        assert excinfo.value.messages == {'foo': {'_schema': ['Invalid input type.']}}
EOF
```

Verify:
```bash
tail -25 tests/test_marshalling.py
```

---

## 4. Confirm pre-fix failure

```bash
python -m pytest tests/test_marshalling.py::TestUnmarshaller::test_deserialize_wrong_nested_type_with_validates_method -v
```

Expected result: **FAILED**, with:
```
TypeError: 'NoneType' object is not subscriptable
```
at `schema.py:894` (`value = data[field_obj.attribute or field_name]`).

This matches the original bug report exactly — confirms the environment and
test are correctly wired. (Confirmed working as of this run.)

---

## 5. Build the clean venv — NOT YET RUN, do this next

```bash
cd ~/open-weight-agent-bench/tasks/marshmallow-1343/clean
py -3.9 -m venv venv
source venv/Scripts/activate
pip install -e ".[tests]"
pip install simplejson
```

---

## 6. Run the harness — NOT YET RUN

```bash
cd ~/open-weight-agent-bench/tasks/marshmallow-1343/clean
source venv/Scripts/activate
source ~/open-weight-agent-bench/eval-env.sh
claude
```

Prompt to paste into Claude Code:

```
After updating from version 2.19.5 to 2.20.0, calling schema.validate() or
schema.load() raises an unhandled TypeError instead of the expected
ValidationError, when a Nested field's inner schema has a method decorated
with @validates and the input data for that nested field is the wrong type
(e.g. a string instead of a dict).

Reproduction:

from marshmallow import Schema, fields, validates

class Bar(Schema):
    value = fields.String()

    @validates('value')
    def validate_value(self, value):
        pass

class Foo(Schema):
    bar = fields.Nested(Bar)

sch = Foo()
sch.validate({'bar': 'invalid'})

This raises: TypeError: 'NoneType' object is not subscriptable

It should instead produce a ValidationError with a message like
{'bar': {'_schema': ['Invalid input type.']}}, the same way it did in 2.19.5.

Fix the bug so this returns a proper validation error instead of crashing.
```

---

## 7. Grade — NOT YET RUN

Copy the harness's fix from `clean/src/marshmallow/` into
`grading/src/marshmallow/` (source files only — never copy test files over),
then:

```bash
cd ~/open-weight-agent-bench/tasks/marshmallow-1343/grading
source venv/Scripts/activate
python -m pytest tests/test_marshalling.py::TestUnmarshaller::test_deserialize_wrong_nested_type_with_validates_method -v
```

**PASSED = task passed.**
