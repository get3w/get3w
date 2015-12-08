package liquid

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParse(t *testing.T) {
	parser := NewParser("")
	results := parser.Parse("username: {{ user.name }}")
	fmt.Println(results)
	assert.NotEmpty(t, results)
}
