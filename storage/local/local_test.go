package local

import (
	"log"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

var service, _ = NewService("")

func TestNewService(t *testing.T) {
	_, err := NewService("_test")
	assert.Nil(t, err)
	_, err = NewService("")
	assert.Nil(t, err)
}

func TestGetSourceKey(t *testing.T) {
	assert.Equal(t, service.GetSourceKey("SUMMARY.md"), "SUMMARY.md")
	assert.Equal(t, service.GetSourceKey("/SUMMARY.md"), "SUMMARY.md")
}

func TestGetFiles(t *testing.T) {
	files, err := service.GetFiles("/")
	for _, file := range files {
		log.Println(file)
	}
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestGetAllFiles(t *testing.T) {
	files, err := service.GetAllFiles(service.SourcePath)
	for _, file := range files {
		log.Println(file)
	}
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestWrite(t *testing.T) {
	err := service.Write("/_test/index.html", []byte("hello world"))
	assert.Nil(t, err)
}

func TestWriteBinary(t *testing.T) {
	bs := []byte("hello world")
	err := service.Write("/_test/1.html", bs)
	assert.Nil(t, err)
	err = service.Write("/_test/2.html", bs)
	assert.Nil(t, err)
}

func TestCopy(t *testing.T) {
	err := service.CopyToDestination("/_test/1.html", "/_test/3.html")
	assert.Nil(t, err)
}

func TestChecksum(t *testing.T) {
	checksum, err := service.Checksum("/_test/1.html")
	assert.Nil(t, err)
	log.Println(checksum)
	assert.NotEmpty(t, checksum)
}

func TestRead(t *testing.T) {
	content, err := service.Read("/_test/index.html")
	log.Println(content)
	assert.Nil(t, err)
}

func TestUpload(t *testing.T) {
	path, _ := filepath.Abs("local_test.go")
	err := service.Upload("/_test/local_test.go", path)
	assert.Nil(t, err)
}

func TestDownload(t *testing.T) {
	err := service.Download("/_test/_sections/1.html", "http://mucho.get3w.net/_sections/1.html")
	assert.Nil(t, err)
}

func TestIsExist(t *testing.T) {
	assert.True(t, service.IsExist("/_test/index.html"))
	assert.False(t, service.IsExist("/_test/index2.html"))
}

func TestDelete(t *testing.T) {
	err := service.Delete("/_test/index.html")
	assert.Nil(t, err)
}

func TestDeletes(t *testing.T) {
	err := service.Deletes([]string{
		"/_test/1.html",
		"/_test/2.html",
	})
	assert.Nil(t, err)
}

// func TestDeleteAll(t *testing.T) {
// 	err := service.DeleteAll("/_test")
// 	assert.Nil(t, err)
// }
