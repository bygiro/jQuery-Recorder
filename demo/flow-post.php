<?php 

/*
// test error:
http_response_code(400);

exit('error');
*/


//Path to autoload.php from current location
require_once './vendor/autoload.php';

$uploadDir = './uploaded_files/';
$config = new \Flow\Config();
$config->setTempDir('./uploaded_files/chunks_temp_folder');
$request = new \Flow\Request();

$rawFileName = $request->getFileName();
$ext = pathinfo($rawFileName, PATHINFO_EXTENSION);
$baseFileName = basename($rawFileName, '.'. $ext );

$filePath = $uploadDir .'/'. $baseFileName .'.'. $ext;
$filePath = preg_replace( '/\\+|\/+/', DIRECTORY_SEPARATOR, $filePath);

// check file exists
$count = 1;
while(is_file($filePath)){
	$filePath = $uploadDir .'/'. $baseFileName .'_'. $count .'.'. $ext;
	$filePath = preg_replace( '/\\+|\/+/', DIRECTORY_SEPARATOR, $filePath);
	$count++;
}

if (\Flow\Basic::save($filePath, $config, $request)) {
	// file saved successfully and can be accessed at './final_file_destination'
	header('Content-Type: application/json; charset=UTF-8');

	$result = array(
		'result' => true,
		'name' => basename($filePath),
		'relativePath' => $filePath
	);
	ob_get_clean();
	exit(json_encode($result, JSON_NUMERIC_CHECK));
} else {
  // This is not a final chunk or request is invalid, continue to upload.
}