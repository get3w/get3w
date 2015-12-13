package liquid

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParse(t *testing.T) {
	l := New("")
	data := make(map[string]interface{})
	data["user"] = map[string]string{
		"name": "test_name",
	}
	results := l.Parse("username: {{ user.name }}", data)
	assert.Equal(t, "username: test_name", results)
}

func TestUnkownAttr(t *testing.T) {
	l := New("")
	data := make(map[string]interface{})
	data["user"] = map[string]interface{}{
		"name": "test_name",
	}
	results := l.Parse("username: {{ user.xxx }}", data)
	assert.Equal(t, "username: ", results)
}

func TestUnkownFilter(t *testing.T) {
	l := New("")
	data := make(map[string]interface{})
	data["user"] = map[string]string{
		"name": "test_name",
	}
	results := l.Parse("username: {{ user.name | dated }}", data)
	assert.Equal(t, "username: test_name", results)
}
