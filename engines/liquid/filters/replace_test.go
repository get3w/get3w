package filters

import (
	"testing"

	"github.com/get3w/get3w/packages/liquid/core"
	"github.com/stretchr/testify/assert"
)

func TestReplaceValuesInAString(t *testing.T) {
	filter := ReplaceFactory([]core.Value{stringValue("foo"), stringValue("bar")})
	assert.Equal(t, filter("foobarforfoo", nil).(string), "barbarforbar")
}

func TestReplaceWithDynamicValues(t *testing.T) {
	filter := ReplaceFactory([]core.Value{dynamicValue("f"), dynamicValue("b")})
	assert.Equal(t, filter("foobarforfoo", params("f", "oo", "b", "br")).(string), "fbrbarforfbr")
}
