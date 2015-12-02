package local

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetDirPath(t *testing.T) {
	_, err := GetDirPath("")
	assert.Nil(t, err)
	_, err = GetDirPath("_test")
	assert.Nil(t, err)
}

func TestMkdirByFile(t *testing.T) {
	filePath, err := filepath.Abs("./_test/dir/file.html")
	assert.Nil(t, err)
	mkdirByFile(filePath)
}

func TestIsDirExist(t *testing.T) {
	assert.True(t, IsDirExist("./_test"))
	assert.False(t, IsDirExist("./_test/not exist"))
}
