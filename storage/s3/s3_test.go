package s3

import (
	"log"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewService(t *testing.T) {
	service := NewService("apps.get3w.com", "")
	assert.Nil(t, service.instance)
}

func TestGetAppPrefix(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	assert.Equal(t, service.getAppPrefix(""), "wwwwww/")
	assert.Equal(t, service.getAppPrefix("/"), "wwwwww/")
	assert.Equal(t, service.getAppPrefix("/test"), "wwwwww/test/")
	assert.Equal(t, service.getAppPrefix("test"), "wwwwww/test/")
}

func TestGetAppKey(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	assert.Equal(t, service.getAppKey("/test"), "wwwwww/test")
	assert.Equal(t, service.getAppKey("test"), "wwwwww/test")
}

func TestGetAllKeys(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	keys, err := service.getAllKeys("/")
	log.Println(len(keys))
	assert.Nil(t, err)
	assert.True(t, len(keys) > 0)
}

func TestGetFiles(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	files, err := service.GetFiles("/")
	log.Println(len(files))
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestWrite(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	err := service.Write("/_test/index.html", "hello world")
	assert.Nil(t, err)
}

func TestWriteBinary(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	bs := []byte("hello world")
	err := service.WriteBinary("/_test/1.html", bs)
	assert.Nil(t, err)
	err = service.WriteBinary("/_test/2.html", bs)
	assert.Nil(t, err)
}

func TestCopy(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	err := service.Copy("/_test/1.html", "/_test/3.html")
	assert.Nil(t, err)
}

func TestRead(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	content, err := service.Read("/_test/index.html")
	log.Println(content)
	assert.Nil(t, err)
}

func TestUpload(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	path, _ := filepath.Abs("s3_test.go")
	log.Println(path)
	err := service.Upload("/_test/s3_test.go", path)
	assert.Nil(t, err)
}

func TestDownload(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	path, _ := filepath.Abs("./_test")
	log.Println(path)
	err := service.Download("/_test/index.html", path)
	assert.Nil(t, err)
}

func TestIsExist(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	assert.True(t, service.IsExist("/_test/index.html"))
	assert.False(t, service.IsExist("/_test/index2.html"))
}

func TestDelete(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	err := service.Delete("/_test/index.html")
	assert.Nil(t, err)
}

func TestDeletes(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	err := service.Deletes([]string{
		"/_test/1.html",
		"/_test/2.html",
	})
	assert.Nil(t, err)
}

func TestDeleteAll(t *testing.T) {
	service := NewService("apps.get3w.com", "wwwwww")
	err := service.DeleteAll("/_test")
	assert.Nil(t, err)
}
