package s3utils

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetFolderNamesAndFileNames(t *testing.T) {
	folders, files, err := GetFolderNamesAndFileNames("get3w.net.source", "local/localxx")
	fmt.Println(folders)
	fmt.Println(files)
	assert.Nil(t, err)
}
