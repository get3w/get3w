package liquid

import (
	"fmt"
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
	fmt.Println(results)
	assert.NotEmpty(t, results)
}
