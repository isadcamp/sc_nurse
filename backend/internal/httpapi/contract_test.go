package httpapi_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestOpenAPIResponseContracts(t *testing.T) {
	b, e := os.ReadFile("../../../docs/openapi.yaml")
	if e != nil {
		t.Fatal(e)
	}
	var spec map[string]any
	if e = json.Unmarshal(b, &spec); e != nil {
		t.Fatal(e)
	}
	schemas := spec["components"].(map[string]any)["schemas"].(map[string]any)
	h, _ := setup()
	for _, tc := range []struct{ path, schema, token string }{{"/api/v1/schedules/1", "Result", headToken}, {"/api/v1/schedules/1/violations", "Report", headToken}, {"/api/v1/schedules/1", "Error", ""}} {
		w := call(h, "GET", tc.path, "", tc.token)
		var payload any
		if e = json.Unmarshal(w.Body.Bytes(), &payload); e != nil {
			t.Fatal(e)
		}
		checkSchema(t, schemas, schemas[tc.schema].(map[string]any), payload, tc.path)
	}
}
func checkSchema(t *testing.T, schemas map[string]any, schema map[string]any, value any, path string) {
	t.Helper()
	if ref, ok := schema["$ref"].(string); ok {
		checkSchema(t, schemas, schemas[strings.TrimPrefix(ref, "#/components/schemas/")].(map[string]any), value, path)
		return
	}
	if choices, ok := schema["enum"].([]any); ok {
		found := false
		for _, c := range choices {
			if c == value {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s enum %v", path, value)
		}
	}
	types := []string{}
	switch x := schema["type"].(type) {
	case string:
		types = append(types, x)
	case []any:
		for _, v := range x {
			types = append(types, v.(string))
		}
	}
	actual := "null"
	switch value.(type) {
	case map[string]any:
		actual = "object"
	case []any:
		actual = "array"
	case string:
		actual = "string"
	case float64:
		actual = "number"
	case bool:
		actual = "boolean"
	}
	matched := len(types) == 0
	for _, typ := range types {
		if typ == actual || (typ == "integer" && actual == "number") {
			matched = true
		}
	}
	if !matched {
		t.Fatalf("%s expected %v got %s", path, types, actual)
	}
	if data, ok := value.(map[string]any); ok {
		props, _ := schema["properties"].(map[string]any)
		if req, ok := schema["required"].([]any); ok {
			for _, k := range req {
				if _, exists := data[k.(string)]; !exists {
					t.Fatalf("%s missing %s", path, k)
				}
			}
		}
		for k, v := range data {
			if child, ok := props[k].(map[string]any); ok {
				checkSchema(t, schemas, child, v, path+"."+k)
			} else if schema["additionalProperties"] == false {
				t.Fatalf("%s unexpected %s", path, k)
			}
		}
	}
	if data, ok := value.([]any); ok {
		for _, v := range data {
			checkSchema(t, schemas, schema["items"].(map[string]any), v, path+"[]")
		}
	}
}
